import type { PoolClient } from "pg";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { createUserNotification, type NotificationTone } from "@/lib/notifications";
import { ensureSettingsSchema } from "@/lib/settings-schema";

export const FARM_INVITATION_EXPIRY_DAYS = 7;
export const FARM_INVITATION_REINVITE_COOLDOWN_DAYS = 30;

export type FarmInvitationDecision = "accepted" | "declined" | "expired";

type InvitationRow = {
  id: string;
  farmId: string;
  farmName: string;
  ownerId: string;
  inviterId: string | null;
  email: string;
  fullName: string | null;
  phone: string | null;
  status?: string | null;
};

export type DeclineFarmInvitationResult = {
  status: "declined" | "expired" | "already_accepted" | "already_declined" | "not_found";
  email?: string | null;
  farmName?: string | null;
};

export type ExpireDeletedFarmAccessInvitationsInput = {
  farmId: string;
  inviteId?: string | null;
  email?: string | null;
  deletedByUserId: string;
  deletedMemberId?: string | null;
  reason: "owner_deleted_invite" | "owner_deleted_member";
};

function normalizeStatus(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function rowToInvitation(row: Record<string, unknown>): InvitationRow {
  return {
    id: String(row.id),
    farmId: String(row.trang_trai_id),
    farmName: String(row.farm_name ?? "trang trại"),
    ownerId: String(row.owner_id),
    inviterId: row.nguoi_moi_id ? String(row.nguoi_moi_id) : null,
    email: String(row.email ?? ""),
    fullName: row.ho_ten ? String(row.ho_ten) : null,
    phone: row.so_dien_thoai ? String(row.so_dien_thoai) : null,
    status: row.trang_thai ? String(row.trang_thai) : null,
  };
}

async function archiveInvitationContact(client: PoolClient, invite: InvitationRow, status: "declined" | "expired") {
  await client.query(
    `insert into du_lieu.lien_he_marketing_loi_moi
       (id, loi_moi_id, trang_trai_id, nguoi_moi_id, ho_ten, email, so_dien_thoai, trang_thai_loi_moi, metadata_json)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
     on conflict (loi_moi_id) do update
     set trang_trai_id = excluded.trang_trai_id,
         nguoi_moi_id = excluded.nguoi_moi_id,
         ho_ten = excluded.ho_ten,
         email = excluded.email,
         so_dien_thoai = excluded.so_dien_thoai,
         trang_thai_loi_moi = excluded.trang_thai_loi_moi,
         metadata_json = du_lieu.lien_he_marketing_loi_moi.metadata_json || excluded.metadata_json,
         updated_at = now()`,
    [
      randomUUID(),
      invite.id,
      invite.farmId,
      invite.inviterId,
      invite.fullName,
      invite.email,
      invite.phone,
      status,
      JSON.stringify({ source: "farm_invitation", farm_name: invite.farmName }),
    ]
  );
}

async function cleanupInvitationPlaceholderAccount(client: PoolClient, farmId: string, email: string) {
  await client.query(
    `delete from du_lieu.thanh_vien_trang_trai tv
     using du_lieu.nguoi_dung u
     where tv.nguoi_dung_id = u.id
       and tv.trang_trai_id = $1
       and lower(u.email) = lower($2)
       and coalesce(tv.metadata_json->>'source', '') = 'settings'`,
    [farmId, email]
  );

  await client.query(
    `delete from du_lieu.nguoi_dung u
     where lower(u.email) = lower($1)
       and not exists (
         select 1
         from du_lieu.thanh_vien_trang_trai tv
         where tv.nguoi_dung_id = u.id
       )
       and not exists (
         select 1
         from du_lieu.trang_trai t
         where t.chu_so_huu_id = u.id
       )`,
    [email]
  );
}

export async function expireDeletedFarmAccessInvitations(client: PoolClient, input: ExpireDeletedFarmAccessInvitationsInput) {
  const result = await client.query(
    `select lm.id::text,
            lm.trang_trai_id::text,
            lm.email,
            lm.ho_ten,
            lm.so_dien_thoai,
            lm.nguoi_moi_id::text,
            lm.trang_thai,
            t.chu_so_huu_id::text as owner_id,
            t.ten_trang_trai as farm_name
     from du_lieu.loi_moi_trang_trai lm
     join du_lieu.trang_trai t on t.id = lm.trang_trai_id
     where lm.trang_trai_id = $1
       and (
         ($2::uuid is not null and lm.id = $2::uuid)
         or ($3::text <> '' and lower(lm.email) = lower($3))
       )
       and lower(coalesce(lm.trang_thai, 'pending')) in ('pending', 'accepted', 'declined', 'expired', 'revoked')
     for update`,
    [input.farmId, input.inviteId || null, input.email?.trim() || ""]
  );

  for (const row of result.rows) {
    const invite = rowToInvitation(row);
    await archiveInvitationContact(client, invite, "expired");
    await cleanupInvitationPlaceholderAccount(client, invite.farmId, invite.email);
    await client.query(
      `update du_lieu.loi_moi_trang_trai
       set trang_thai = 'expired',
           metadata_json = coalesce(metadata_json, '{}'::jsonb) || $2::jsonb,
           updated_at = now()
       where id = $1`,
      [
        invite.id,
        JSON.stringify({
          deleted_by_owner: true,
          deleted_by_user_id: input.deletedByUserId,
          deleted_member_id: input.deletedMemberId ?? null,
          expire_reason: input.reason,
        }),
      ]
    );
  }

  return result.rowCount ?? 0;
}

export async function notifyFarmInvitationOwner(input: {
  ownerId: string;
  farmId: string;
  farmName: string;
  email: string;
  fullName?: string | null;
  decision: FarmInvitationDecision;
  inviteId?: string | null;
}) {
  const inviteeName = input.fullName?.trim() || input.email;
  const decisionText: Record<FarmInvitationDecision, string> = {
    accepted: "đã chấp nhận",
    declined: "đã từ chối",
    expired: "đã hết hạn",
  };
  const tone: Record<FarmInvitationDecision, NotificationTone> = {
    accepted: "success",
    declined: "warning",
    expired: "warning",
  };

  await createUserNotification({
    userId: input.ownerId,
    farmId: input.farmId,
    title: `Lời mời ${decisionText[input.decision]}`,
    body: `${inviteeName} ${decisionText[input.decision]} lời mời tham gia ${input.farmName}.`,
    tone: tone[input.decision],
    module: "users",
    href: "/dashboard/settings/nguoi-dung",
    metadata: {
      inviteId: input.inviteId ?? null,
      invitedEmail: input.email,
      decision: input.decision,
    },
  });
}

export async function expireFarmInvitations(farmId?: string | null) {
  await ensureSettingsSchema();

  const expiredInvites: InvitationRow[] = [];
  const client = await db.connect();
  try {
    await client.query("begin");

    const result = await client.query(
      `select lm.id::text,
              lm.trang_trai_id::text,
              lm.email,
              lm.ho_ten,
              lm.so_dien_thoai,
              lm.nguoi_moi_id::text,
              t.chu_so_huu_id::text as owner_id,
              t.ten_trang_trai as farm_name
       from du_lieu.loi_moi_trang_trai lm
       join du_lieu.trang_trai t on t.id = lm.trang_trai_id
       where lower(coalesce(lm.trang_thai, 'pending')) = 'pending'
         and lm.het_han_luc is not null
         and lm.het_han_luc <= now()
         and ($1::uuid is null or lm.trang_trai_id = $1::uuid)
       for update`,
      [farmId || null]
    );

    for (const row of result.rows) {
      const invite = rowToInvitation(row);
      await archiveInvitationContact(client, invite, "expired");
      await cleanupInvitationPlaceholderAccount(client, invite.farmId, invite.email);
      await client.query(
        `update du_lieu.loi_moi_trang_trai
         set trang_thai = 'expired',
             updated_at = now()
         where id = $1`,
        [invite.id]
      );
      expiredInvites.push(invite);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  await Promise.allSettled(
    expiredInvites.map((invite) =>
      notifyFarmInvitationOwner({
        ownerId: invite.ownerId,
        farmId: invite.farmId,
        farmName: invite.farmName,
        email: invite.email,
        fullName: invite.fullName,
        decision: "expired",
        inviteId: invite.id,
      })
    )
  );

  return expiredInvites.length;
}

export async function declineFarmInvitation(token: string): Promise<DeclineFarmInvitationResult> {
  const cleanToken = token.trim();
  if (!cleanToken) return { status: "not_found" };

  await expireFarmInvitations();

  let declinedInvite: InvitationRow | null = null;
  let finalResult: DeclineFarmInvitationResult | null = null;
  const client = await db.connect();
  try {
    await client.query("begin");

    const result = await client.query(
      `select lm.id::text,
              lm.trang_trai_id::text,
              lm.email,
              lm.ho_ten,
              lm.so_dien_thoai,
              lm.nguoi_moi_id::text,
              lm.trang_thai,
              lm.het_han_luc,
              t.chu_so_huu_id::text as owner_id,
              t.ten_trang_trai as farm_name
       from du_lieu.loi_moi_trang_trai lm
       join du_lieu.trang_trai t on t.id = lm.trang_trai_id
       where lm.token = $1
       limit 1
       for update`,
      [cleanToken]
    );

    const row = result.rows[0] as (Record<string, unknown> & { het_han_luc?: Date | string | null }) | undefined;
    if (!row) {
      await client.query("commit");
      return { status: "not_found" };
    }

    const invite = rowToInvitation(row);
    const status = normalizeStatus(row.trang_thai);
    if (status === "accepted") {
      await client.query("commit");
      return { status: "already_accepted", email: invite.email, farmName: invite.farmName };
    }
    if (status === "declined") {
      await client.query("commit");
      return { status: "already_declined", email: invite.email, farmName: invite.farmName };
    }
    if (status === "expired") {
      await client.query("commit");
      return { status: "expired", email: invite.email, farmName: invite.farmName };
    }

    const expiresAt = row.het_han_luc ? new Date(row.het_han_luc) : null;
    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      await archiveInvitationContact(client, invite, "expired");
      await cleanupInvitationPlaceholderAccount(client, invite.farmId, invite.email);
      await client.query(
        `update du_lieu.loi_moi_trang_trai
         set trang_thai = 'expired',
             updated_at = now()
         where id = $1`,
        [invite.id]
      );
      declinedInvite = { ...invite, status: "expired" };
      finalResult = { status: "expired", email: invite.email, farmName: invite.farmName };
    } else {
      await archiveInvitationContact(client, invite, "declined");
      await cleanupInvitationPlaceholderAccount(client, invite.farmId, invite.email);
      await client.query(
        `update du_lieu.loi_moi_trang_trai
         set trang_thai = 'declined',
             updated_at = now()
         where id = $1`,
        [invite.id]
      );
      declinedInvite = invite;
      finalResult = { status: "declined", email: invite.email, farmName: invite.farmName };
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  if (declinedInvite) {
    await notifyFarmInvitationOwner({
      ownerId: declinedInvite.ownerId,
      farmId: declinedInvite.farmId,
      farmName: declinedInvite.farmName,
      email: declinedInvite.email,
      fullName: declinedInvite.fullName,
      decision: declinedInvite.status === "expired" ? "expired" : "declined",
      inviteId: declinedInvite.id,
    }).catch((error) => {
      console.warn("[farm_invitation_notification_failed]", error);
    });
  }

  return finalResult ?? {
    status: "declined",
    email: declinedInvite?.email ?? null,
    farmName: declinedInvite?.farmName ?? null,
  };
}
