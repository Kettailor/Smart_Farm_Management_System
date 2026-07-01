import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { layOwnerIdTuRequest, layOwnerIdTuServerCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleFarmId } from "@/lib/farm-access";
import { ensureWorkSchema } from "@/lib/cong-viec-schema";
import { loadWorkTasks } from "@/lib/cong-viec-data";
import { buildWorkTaskAssignmentEmail, sendMail } from "@/lib/mail";
import { createUserNotification } from "@/lib/notifications";
import {
  WORK_PRIORITY_LABELS,
  isWorkItemStatus,
  isWorkPriority,
  type WorkItemStatus,
  type WorkPriority,
} from "@/lib/cong-viec-types";

export const dynamic = "force-dynamic";

type ItemPayload = {
  action?: unknown;
  itemId?: unknown;
  title?: unknown;
  description?: unknown;
  note?: unknown;
  estimate?: unknown;
  attachments?: unknown;
  status?: unknown;
  priority?: unknown;
  assignee?: unknown;
  reporter?: unknown;
  dueDate?: unknown;
  zoneId?: unknown;
};

type StoredAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  uploadedAt: string;
  uploadedBy: string | null;
};

type AssigneeContact = {
  id: string;
  name: string;
  email: string | null;
};

function cleanString(value: unknown, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function dateOrNull(value: unknown) {
  const raw = cleanString(value, 20);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

function samePerson(a: string | null, b: string | null) {
  return String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();
}

function metadataObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function normalizeAttachments(value: unknown, uploadedBy: string | null): StoredAttachment[] {
  if (!Array.isArray(value)) return [];
  const allowedTypes = new Set([
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ]);

  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const name = cleanString(row.name, 180);
    const type = cleanString(row.type, 120) ?? "application/octet-stream";
    const dataUrl = cleanString(row.dataUrl, 7_000_000);
    const size = Number(row.size ?? 0);
    const isImage = type.startsWith("image/");
    const isAllowedDocument = allowedTypes.has(type);
    if (!name || !dataUrl || !Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) return [];
    if (!isImage && !isAllowedDocument) return [];
    if (!dataUrl.startsWith("data:")) return [];
    return [{
      id: cleanString(row.id, 80) ?? randomUUID(),
      name,
      type,
      size,
      dataUrl,
      uploadedAt: new Date().toISOString(),
      uploadedBy,
    }];
  });
}

function storedAttachments(value: unknown): StoredAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const id = cleanString(row.id, 80);
    const name = cleanString(row.name, 180);
    const type = cleanString(row.type, 120) ?? "application/octet-stream";
    const dataUrl = cleanString(row.dataUrl, 7_000_000);
    const uploadedAt = cleanString(row.uploadedAt, 40) ?? new Date().toISOString();
    const size = Number(row.size ?? 0);
    if (!id || !name || !dataUrl || !Number.isFinite(size)) return [];
    return [{ id, name, type, size, dataUrl, uploadedAt, uploadedBy: cleanString(row.uploadedBy, 120) }];
  });
}

async function getOwnerFarmId(ownerId: string) {
  return getAccessibleFarmId(ownerId, "write");
}

async function getCurrentUserLabel(ownerId: string) {
  const userRs = await db.query<{ label: string | null }>(
    `select coalesce(nullif(ho_ten, ''), nullif(email, '')) as label
     from du_lieu.nguoi_dung
     where id = $1
     limit 1`,
    [ownerId]
  );
  return cleanString(userRs.rows[0]?.label, 120);
}

async function getZoneName(farmId: string, zoneId: string | null) {
  if (!zoneId) return null;
  const zoneRs = await db.query<{ name: string | null }>(
    `select coalesce(nullif(ten_khu_vuc, ''), ma_khu_vuc, id::text) as name
     from du_lieu.khu_vuc
     where trang_trai_id = $1 and id::text = $2
     limit 1`,
    [farmId, zoneId]
  );
  return cleanString(zoneRs.rows[0]?.name, 180);
}

function buildAbsoluteUrl(request: NextRequest, path: string) {
  const appUrl = cleanString(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL, 240);
  const origin = appUrl?.replace(/\/+$/, "") || request.nextUrl.origin;
  return `${origin}${path}`;
}

async function findFarmUserByLabel(farmId: string, label: string | null): Promise<AssigneeContact | null> {
  if (!label) return null;
  const userRs = await db.query<AssigneeContact>(
    `with farm_users as (
       select u.id::text,
              coalesce(nullif(u.ho_ten, ''), nullif(u.email, ''), 'Người dùng') as name,
              u.email
       from du_lieu.nguoi_dung u
       join du_lieu.trang_trai t on t.id = $1 and t.chu_so_huu_id = u.id
       union
       select u.id::text,
              coalesce(nullif(u.ho_ten, ''), nullif(u.email, ''), 'Người dùng') as name,
              u.email
       from du_lieu.nguoi_dung u
       join du_lieu.thanh_vien_trang_trai tv on tv.nguoi_dung_id = u.id
       where tv.trang_trai_id = $1
         and coalesce(lower(tv.trang_thai), '') not in ('inactive', 'disabled', 'da_huy', 'da huy', 'đã hủy', 'cancelled')
     )
     select id, name, email
     from farm_users
     where lower(name) = lower($2)
        or lower(coalesce(email, '')) = lower($2)
     order by case when lower(coalesce(email, '')) = lower($2) then 0 else 1 end, name asc
     limit 1`,
    [farmId, label]
  );
  return userRs.rows[0] ?? null;
}

async function notifyAssigneeOfNewItem(input: {
  request: NextRequest;
  farmId: string;
  workId: string;
  itemId: string;
  workTitle: string;
  itemTitle: string;
  assignee: string | null;
  reporter: string;
  dueDate: string | null;
  priority: WorkPriority;
}) {
  const assignee = await findFarmUserByLabel(input.farmId, input.assignee);
  if (!assignee) return input.assignee ? `Không tìm thấy tài khoản người phụ trách "${input.assignee}" để gửi thông báo.` : null;

  const href = `/dashboard/cong-viec?workId=${encodeURIComponent(input.workId)}`;
  await createUserNotification({
    userId: assignee.id,
    farmId: input.farmId,
    title: "Nhiệm vụ mới",
    body: `${input.itemTitle} - ${input.workTitle}`,
    tone: "info",
    module: "Công việc",
    href,
    metadata: { workId: input.workId, itemId: input.itemId },
  });

  if (!assignee.email) return "Đã gửi thông báo trong hệ thống, nhưng người phụ trách chưa có email.";

  const emailContent = buildWorkTaskAssignmentEmail({
    appName: process.env.NEXT_PUBLIC_APP_NAME?.trim() || undefined,
    taskTitle: input.itemTitle,
    workTitle: input.workTitle,
    assigneeName: assignee.name,
    reporterName: input.reporter,
    dueDate: input.dueDate,
    priority: WORK_PRIORITY_LABELS[input.priority],
    taskUrl: buildAbsoluteUrl(input.request, href),
  });
  const mailResult = await sendMail({ to: assignee.email, ...emailContent });
  return mailResult.sent ? null : mailResult.reason || "Webmail/SMTP chua san sang.";
}

function normalizePayload(body: ItemPayload) {
  const status: WorkItemStatus = isWorkItemStatus(body.status) ? body.status : "chua_lam";
  const priority: WorkPriority = isWorkPriority(body.priority) ? body.priority : "trung_binh";
  return {
    title: cleanString(body.title, 180),
    note: cleanString(body.description ?? body.note, 2000),
    estimate: cleanString(body.estimate, 240),
    status,
    priority,
    assignee: cleanString(body.assignee, 120),
    reporter: cleanString(body.reporter, 120),
    dueDate: dateOrNull(body.dueDate),
    zoneId: cleanString(body.zoneId, 80),
  };
}

export async function POST(request: NextRequest, { params }: { params: { workId: string } }) {
  try {
    const ownerId = layOwnerIdTuRequest(request) || layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    await ensureWorkSchema();
    const farmId = await getOwnerFarmId(ownerId);
    if (!farmId) return NextResponse.json({ message: "Không có quyền thêm nhiệm vụ." }, { status: 403 });

    const workId = cleanString(params.workId, 80);
    if (!workId) return NextResponse.json({ message: "Công việc không hợp lệ." }, { status: 400 });

    const workRs = await db.query<{ id: string; title: string | null }>(
      `select id::text, ten_cong_viec as title
       from du_lieu.cong_viec
       where id::text = $1 and trang_trai_id = $2
       limit 1`,
      [workId, farmId]
    );
    if (!workRs.rows[0]) return NextResponse.json({ message: "Không tìm thấy công việc." }, { status: 404 });

    const payload = normalizePayload((await request.json()) as ItemPayload);
    if (!payload.title) return NextResponse.json({ message: "Vui lòng nhập tóm tắt nhiệm vụ." }, { status: 400 });

    const reporter = payload.reporter ?? (await getCurrentUserLabel(ownerId));
    if (!reporter) return NextResponse.json({ message: "Vui lòng chọn người báo cáo." }, { status: 400 });

    const zoneName = await getZoneName(farmId, payload.zoneId);
    if (payload.zoneId && !zoneName) return NextResponse.json({ message: "Khu vực được chọn không hợp lệ." }, { status: 400 });

    const inserted = await db.query<{ id: string }>(
      `insert into du_lieu.cong_viec_hang_muc (
         id, cong_viec_id, tieu_de, trang_thai, muc_uu_tien, ngay_het_han,
         nguoi_phu_trach, nguoi_bao_cao, ghi_chu, metadata_json
       )
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       returning id::text`,
      [
        randomUUID(),
        workId,
        payload.title,
        payload.status,
        payload.priority,
        payload.dueDate,
        payload.assignee,
        reporter,
        payload.note,
        JSON.stringify({ zoneId: payload.zoneId, zoneName, estimate: payload.estimate, attachments: [], source: "cong-viec-module" }),
      ]
    );
    await db.query(`update du_lieu.cong_viec set updated_at = now() where id::text = $1`, [workId]);

    let assignmentNotificationWarning: string | null = null;
    if (inserted.rows[0]?.id) {
      assignmentNotificationWarning = await notifyAssigneeOfNewItem({
        request,
        farmId,
        workId,
        itemId: inserted.rows[0].id,
        workTitle: cleanString(workRs.rows[0].title, 180) ?? "Công việc",
        itemTitle: payload.title,
        assignee: payload.assignee,
        reporter,
        dueDate: payload.dueDate,
        priority: payload.priority,
      }).catch((error) => `Đã thêm nhiệm vụ, nhưng chưa gửi được thông báo/email: ${String(error)}`);
    }

    const task = (await loadWorkTasks(farmId)).find((item) => item.id === workId);
    return NextResponse.json({ message: "Đã thêm nhiệm vụ.", task, assignmentNotificationWarning });
  } catch (error) {
    return NextResponse.json({ message: "Không thể thêm nhiệm vụ.", error: String(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { workId: string } }) {
  try {
    const ownerId = layOwnerIdTuRequest(request) || layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    await ensureWorkSchema();
    const farmId = await getOwnerFarmId(ownerId);
    if (!farmId) return NextResponse.json({ message: "Chưa có trang trại để cập nhật nhiệm vụ." }, { status: 404 });

    const workId = cleanString(params.workId, 80);
    if (!workId) return NextResponse.json({ message: "Công việc không hợp lệ." }, { status: 400 });

    const body = (await request.json()) as ItemPayload;
    const itemId = cleanString(body.itemId, 80);
    const action = cleanString(body.action, 40);
    if (!itemId) return NextResponse.json({ message: "Nhiệm vụ không hợp lệ." }, { status: 400 });

    const currentUser = await getCurrentUserLabel(ownerId);
    if (!currentUser) return NextResponse.json({ message: "Không xác định được người dùng hiện tại." }, { status: 403 });

    const itemRs = await db.query<{
      id: string;
      reporter: string | null;
      assignee: string | null;
      status: string | null;
      metadata_json: Record<string, unknown> | null;
    }>(
      `select hm.id::text,
              hm.nguoi_bao_cao as reporter,
              hm.nguoi_phu_trach as assignee,
              hm.trang_thai as status,
              hm.metadata_json
       from du_lieu.cong_viec_hang_muc hm
       join du_lieu.cong_viec cv on cv.id = hm.cong_viec_id
       where hm.id::text = $1
         and hm.cong_viec_id::text = $2
         and cv.trang_trai_id = $3
         and hm.trang_thai <> 'da_huy'
       limit 1`,
      [itemId, workId, farmId]
    );
    const item = itemRs.rows[0];
    if (!item) return NextResponse.json({ message: "Không tìm thấy nhiệm vụ." }, { status: 404 });

    const metadata = metadataObject(item.metadata_json);
    if (action === "edit") {
      if (!samePerson(currentUser, item.reporter)) {
        return NextResponse.json({ message: "Chỉ người báo cáo được chỉnh sửa thông tin nhiệm vụ." }, { status: 403 });
      }

      const payload = normalizePayload(body);
      if (!payload.title) return NextResponse.json({ message: "Vui lòng nhập tóm tắt nhiệm vụ." }, { status: 400 });

      const zoneName = await getZoneName(farmId, payload.zoneId);
      if (payload.zoneId && !zoneName) return NextResponse.json({ message: "Khu vực được chọn không hợp lệ." }, { status: 400 });

      await db.query(
        `update du_lieu.cong_viec_hang_muc
         set tieu_de = $1,
             ghi_chu = $2,
             muc_uu_tien = $3,
             ngay_het_han = $4,
             nguoi_phu_trach = $5,
             metadata_json = $6::jsonb,
             updated_at = now()
         where id::text = $7 and cong_viec_id::text = $8`,
        [
          payload.title,
          payload.note,
          payload.priority,
          payload.dueDate,
          payload.assignee,
          JSON.stringify({ ...metadata, zoneId: payload.zoneId, zoneName, estimate: payload.estimate }),
          itemId,
          workId,
        ]
      );
    } else if (action === "attachments") {
      if (!samePerson(currentUser, item.assignee) && !samePerson(currentUser, item.reporter)) {
        return NextResponse.json({ message: "Chỉ người phụ trách hoặc người báo cáo được tải tệp đính kèm." }, { status: 403 });
      }
      if (item.status === "hoan_thanh") {
        return NextResponse.json({ message: "Nhiệm vụ đã hoàn thành. Hãy bỏ tick hoàn thành trước khi bổ sung tệp." }, { status: 400 });
      }

      const incoming = normalizeAttachments(body.attachments, currentUser);
      if (incoming.length === 0) {
        return NextResponse.json({ message: "Chỉ hỗ trợ ảnh, PDF hoặc Word dưới 5MB mỗi tệp." }, { status: 400 });
      }
      const nextAttachments = [...storedAttachments(metadata.attachments), ...incoming].slice(0, 12);
      await db.query(
        `update du_lieu.cong_viec_hang_muc
         set metadata_json = $1::jsonb, updated_at = now()
         where id::text = $2 and cong_viec_id::text = $3`,
        [JSON.stringify({ ...metadata, attachments: nextAttachments }), itemId, workId]
      );
    } else if (action === "status") {
      if (!samePerson(currentUser, item.assignee)) {
        return NextResponse.json({ message: "Chỉ người phụ trách được cập nhật trạng thái hoàn thành." }, { status: 403 });
      }

      const status: WorkItemStatus = isWorkItemStatus(body.status) && body.status !== "da_huy" ? body.status : "chua_lam";
      const statusMetadata = {
        ...metadata,
        statusUpdatedBy: currentUser,
        statusUpdatedAt: new Date().toISOString(),
        completedBy: status === "hoan_thanh" ? currentUser : null,
        completedAt: status === "hoan_thanh" ? new Date().toISOString() : null,
      };
      await db.query(
        `update du_lieu.cong_viec_hang_muc
         set trang_thai = $1, metadata_json = $2::jsonb, updated_at = now()
         where id::text = $3 and cong_viec_id::text = $4`,
        [status, JSON.stringify(statusMetadata), itemId, workId]
      );
    } else {
      return NextResponse.json({ message: "Tác vụ cập nhật nhiệm vụ không hợp lệ." }, { status: 400 });
    }

    await db.query(`update du_lieu.cong_viec set updated_at = now() where id::text = $1`, [workId]);
    const task = (await loadWorkTasks(farmId)).find((item) => item.id === workId);
    return NextResponse.json({ message: "Đã cập nhật nhiệm vụ.", task });
  } catch (error) {
    return NextResponse.json({ message: "Không thể cập nhật nhiệm vụ.", error: String(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { workId: string } }) {
  try {
    const ownerId = layOwnerIdTuRequest(request) || layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    await ensureWorkSchema();
    const farmId = await getOwnerFarmId(ownerId);
    if (!farmId) return NextResponse.json({ message: "Không có quyền xóa nhiệm vụ." }, { status: 403 });

    const workId = cleanString(params.workId, 80);
    const itemId = cleanString(request.nextUrl.searchParams.get("itemId"), 80);
    if (!workId) return NextResponse.json({ message: "Công việc không hợp lệ." }, { status: 400 });
    if (!itemId) return NextResponse.json({ message: "Nhiệm vụ không hợp lệ." }, { status: 400 });

    const workRs = await db.query<{ id: string }>(
      `select id::text
       from du_lieu.cong_viec
       where id::text = $1 and trang_trai_id = $2
       limit 1`,
      [workId, farmId]
    );
    if (!workRs.rows[0]) return NextResponse.json({ message: "Không tìm thấy công việc." }, { status: 404 });

    const deleted = await db.query<{ id: string }>(
      `update du_lieu.cong_viec_hang_muc
       set trang_thai = 'da_huy', updated_at = now()
       where id::text = $1
         and cong_viec_id::text = $2
         and trang_thai <> 'da_huy'
       returning id::text`,
      [itemId, workId]
    );
    if (!deleted.rows[0]) return NextResponse.json({ message: "Không tìm thấy nhiệm vụ." }, { status: 404 });

    await db.query(`update du_lieu.cong_viec set updated_at = now() where id::text = $1`, [workId]);

    const task = (await loadWorkTasks(farmId)).find((item) => item.id === workId);
    return NextResponse.json({ message: "Đã xóa nhiệm vụ.", task });
  } catch (error) {
    return NextResponse.json({ message: "Không thể xóa nhiệm vụ.", error: String(error) }, { status: 500 });
  }
}
