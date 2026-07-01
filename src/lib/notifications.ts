import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export type NotificationTone = "info" | "success" | "warning" | "danger";

export type UserNotification = {
  id: string;
  userId: string;
  farmId: string | null;
  title: string;
  body: string | null;
  tone: NotificationTone;
  module: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  createdAt: string;
};

export type CreateUserNotificationInput = {
  userId: string;
  farmId?: string | null;
  title: string;
  body?: string | null;
  tone?: NotificationTone;
  module?: string | null;
  href?: string | null;
  metadata?: Record<string, unknown>;
};

export type NotifyFarmUsersInput = Omit<CreateUserNotificationInput, "userId"> & {
  farmId: string;
  excludeUserId?: string | null;
};

type NotificationListener = (notification: UserNotification) => void;

const listeners = new Map<string, Set<NotificationListener>>();
let schemaReady: Promise<void> | null = null;

function rowToNotification(row: Record<string, unknown>): UserNotification {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? new Date().toISOString());
  const readAt = row.doc_luc instanceof Date ? row.doc_luc.toISOString() : row.doc_luc ? String(row.doc_luc) : null;
  const metadata = row.metadata_json && typeof row.metadata_json === "object" ? (row.metadata_json as Record<string, unknown>) : {};

  return {
    id: String(row.id),
    userId: String(row.nguoi_dung_id),
    farmId: row.trang_trai_id ? String(row.trang_trai_id) : null,
    title: String(row.tieu_de ?? ""),
    body: row.noi_dung ? String(row.noi_dung) : null,
    tone: (String(row.loai ?? "info") as NotificationTone) || "info",
    module: row.module ? String(row.module) : null,
    href: row.href ? String(row.href) : null,
    metadata,
    read: Boolean(row.da_doc),
    readAt,
    createdAt,
  };
}

function emitNotification(notification: UserNotification) {
  const userListeners = listeners.get(notification.userId);
  if (!userListeners) return;
  for (const listener of userListeners) listener(notification);
}

export function subscribeUserNotifications(userId: string, listener: NotificationListener) {
  const userListeners = listeners.get(userId) ?? new Set<NotificationListener>();
  userListeners.add(listener);
  listeners.set(userId, userListeners);

  return () => {
    const current = listeners.get(userId);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(userId);
  };
}

export async function ensureNotificationSchema() {
  if (!shouldRunRuntimeSchemaSync()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`
        create table if not exists du_lieu.thong_bao_nguoi_dung (
          id uuid primary key default du_lieu.uuid_v4(),
          nguoi_dung_id uuid not null references du_lieu.nguoi_dung(id) on delete cascade,
          trang_trai_id uuid references du_lieu.trang_trai(id) on delete cascade,
          tieu_de text not null,
          noi_dung text,
          loai text not null default 'info',
          module text,
          href text,
          metadata_json jsonb not null default '{}'::jsonb,
          da_doc boolean not null default false,
          doc_luc timestamptz,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        )
      `);
      await db.query(`create index if not exists idx_thong_bao_nguoi_dung_user_created on du_lieu.thong_bao_nguoi_dung(nguoi_dung_id, created_at desc, id desc)`);
      await db.query(`create index if not exists idx_thong_bao_nguoi_dung_user_unread on du_lieu.thong_bao_nguoi_dung(nguoi_dung_id) where da_doc = false`);
    })();
  }

  return schemaReady;
}

export async function createUserNotification(input: CreateUserNotificationInput) {
  await ensureNotificationSchema();
  const result = await db.query(
    `insert into du_lieu.thong_bao_nguoi_dung
       (id, nguoi_dung_id, trang_trai_id, tieu_de, noi_dung, loai, module, href, metadata_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     returning *`,
    [
      randomUUID(),
      input.userId,
      input.farmId ?? null,
      input.title.trim(),
      input.body?.trim() || null,
      input.tone ?? "info",
      input.module ?? null,
      input.href ?? null,
      JSON.stringify(input.metadata ?? {}),
    ]
  );

  const notification = rowToNotification(result.rows[0]);
  emitNotification(notification);
  return notification;
}

export async function notifyFarmUsers(input: NotifyFarmUsersInput) {
  await ensureNotificationSchema();
  const users = await db.query<{ id: string }>(
    `select distinct user_id as id
     from (
       select t.chu_so_huu_id::text as user_id
       from du_lieu.trang_trai t
       where t.id = $1
       union
       select tv.nguoi_dung_id::text as user_id
       from du_lieu.thanh_vien_trang_trai tv
       where tv.trang_trai_id = $1
         and coalesce(lower(tv.trang_thai), '') not in ('inactive', 'disabled', 'da_huy', 'da huy', 'đã hủy', 'cancelled')
     ) users
     where ($2::text is null or user_id <> $2)`,
    [input.farmId, input.excludeUserId ?? null]
  );

  return Promise.all(
    users.rows.map((row) =>
      createUserNotification({
        userId: row.id,
        farmId: input.farmId,
        title: input.title,
        body: input.body,
        tone: input.tone,
        module: input.module,
        href: input.href,
        metadata: input.metadata,
      })
    )
  );
}

export async function listUserNotifications(userId: string, limit = 20, offset = 0) {
  await ensureNotificationSchema();
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const safeOffset = Math.max(offset, 0);
  const [items, unread] = await Promise.all([
    db.query(
      `select *
       from du_lieu.thong_bao_nguoi_dung
       where nguoi_dung_id = $1
       order by created_at desc, id desc
       limit $2 offset $3`,
      [userId, safeLimit, safeOffset]
    ),
    db.query(`select count(*)::int as count from du_lieu.thong_bao_nguoi_dung where nguoi_dung_id = $1 and da_doc = false`, [userId]),
  ]);

  return {
    notifications: items.rows.map(rowToNotification),
    unreadCount: Number(unread.rows[0]?.count ?? 0),
    nextOffset: safeOffset + items.rows.length,
    hasMore: items.rows.length === safeLimit,
  };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await ensureNotificationSchema();
  const result = await db.query(
    `update du_lieu.thong_bao_nguoi_dung
     set da_doc = true,
         doc_luc = coalesce(doc_luc, now()),
         updated_at = now()
     where id = $1 and nguoi_dung_id = $2
     returning *`,
    [notificationId, userId]
  );
  return result.rows[0] ? rowToNotification(result.rows[0]) : null;
}

export async function markAllNotificationsRead(userId: string) {
  await ensureNotificationSchema();
  await db.query(
    `update du_lieu.thong_bao_nguoi_dung
     set da_doc = true,
         doc_luc = coalesce(doc_luc, now()),
         updated_at = now()
     where nguoi_dung_id = $1 and da_doc = false`,
    [userId]
  );
}
