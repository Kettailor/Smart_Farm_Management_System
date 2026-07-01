import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import { layOwnerIdTuRequest, layOwnerIdTuServerCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { getAccessibleFarmId, type FarmAccessAction } from "@/lib/farm-access";
import { ensureGrazingSchema } from "@/lib/grazing-schema";
import { loadGrazingGroups, loadGrazingPaddocks, loadGrazingPlans } from "@/lib/grazing-data";
import { escapeHtml, sendMail } from "@/lib/mail";
import { createUserNotification } from "@/lib/notifications";
import { isGrazingEventType, isGrazingPlanType, isGrazingStatus, type GrazingEventType, type GrazingPlan, type GrazingPlanType, type GrazingStatus } from "@/lib/grazing-types";

export const dynamic = "force-dynamic";
const PERPETUAL_PLAN_DAYS = 7;

type EventPayload = {
  id?: unknown;
  type?: unknown;
  title?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  prerequisite?: unknown;
  prerequisiteId?: unknown;
  note?: unknown;
  repeat?: unknown;
  recurrenceIndex?: unknown;
  durationDays?: unknown;
};
type PaddockPayload = { paddockId?: unknown; priority?: unknown; rating?: unknown; supply?: unknown; events?: unknown };
type NormalizedEventPayload = {
  type: GrazingEventType;
  title: string;
  startDate: string | null;
  endDate: string | null;
  note: string | null;
  metadata: {
    sourceId: string | null;
    prerequisiteId: string | null;
    dependencyType: string | null;
    repeat: boolean;
    recurrenceIndex: number | null;
    durationDays: number | null;
    startTime: string | null;
    endTime: string | null;
  };
};
type GrazingPayload = {
  code?: unknown;
  name?: unknown;
  type?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  season?: unknown;
  manager?: unknown;
  note?: unknown;
  paddocks?: unknown;
  paddockIds?: unknown;
  groupIds?: unknown;
};
type AssigneeContact = { id: string; name: string; email: string | null };

function cleanString(value: unknown, max = 240) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return text.slice(0, max);
}

function parseIntValue(value: unknown, fallback = 5) {
  const parsed = Number(String(value ?? "").replace(/[^\d]/g, ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(10, Math.round(parsed)));
}

function dateOrNull(value: unknown) {
  const raw = cleanString(value, 32);
  const match = raw?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? null;
}

function timeOrNull(value: unknown) {
  const raw = cleanString(value, 32);
  const match = raw?.match(/(?:T)?(\d{2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) return null;
  return `${match[1]}:${match[2]}`;
}

function addDays(value: string, days: number) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return value;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function minIsoDate(a: string, b: string) {
  return a < b ? a : b;
}

function daysBetween(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null;
  const start = dateToUtcTime(startDate);
  const end = dateToUtcTime(endDate);
  if (start == null || end == null) return null;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

function dateToUtcTime(value: string) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  return Date.UTC(year, month - 1, day);
}

function dateTimeToUtcMs(dateValue: string | null, timeValue: string | null, endOfDay = false) {
  if (!dateValue) return null;
  const date = dateToUtcTime(dateValue);
  if (date == null) return null;
  const time = timeOrNull(timeValue);
  if (!time) return date + (endOfDay ? 86_400_000 - 60_000 : 0);
  const [hour, minute] = time.split(":").map(Number);
  return date + (hour * 60 + minute) * 60_000;
}

function dateTimeFromUtcMs(value: number) {
  const date = new Date(value);
  return { date: date.toISOString().slice(0, 10), time: date.toISOString().slice(11, 16) };
}

function stringList(value: unknown) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return Array.from(new Set(values.map((item) => cleanString(item, 80)).filter((item): item is string => Boolean(item))));
}

function boolValue(value: unknown) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function positiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function alignFinishStartDependencies(events: NormalizedEventPayload[]) {
  return events.map((event) => {
    const prerequisiteId = event.metadata.prerequisiteId;
    if (!prerequisiteId) return event;
    const currentStart = dateTimeToUtcMs(event.startDate, event.metadata.startTime);
    const currentEnd = dateTimeToUtcMs(event.endDate ?? event.startDate, event.metadata.endTime, !event.metadata.endTime);
    if (currentStart == null || currentEnd == null || currentEnd <= currentStart) return event;
    const candidates = events
      .filter((item) => item !== event && item.metadata.sourceId === prerequisiteId)
      .map((item) => ({
        event: item,
        end: dateTimeToUtcMs(item.endDate ?? item.startDate, item.metadata.endTime, !item.metadata.endTime),
      }))
      .filter((item): item is { event: NormalizedEventPayload; end: number } => item.end != null)
      .sort((a, b) => a.end - b.end);
    if (!candidates.length) return event;
    const source = candidates.filter((item) => item.end <= currentStart).at(-1) ?? candidates.find((item) => item.end > currentStart) ?? candidates.at(-1);
    if (!source) return event;
    const durationMinutes = Math.max(1, Math.round((currentEnd - currentStart) / 60_000));
    const nextStart = dateTimeFromUtcMs(source.end);
    const nextEnd = dateTimeFromUtcMs(source.end + durationMinutes * 60_000);
    return {
      ...event,
      startDate: nextStart.date,
      endDate: nextEnd.date,
      metadata: { ...event.metadata, startTime: nextStart.time, endTime: nextEnd.time },
    };
  });
}

function normalizeEvents(value: unknown, fallbackStart: string | null, fallbackEnd: string | null, planType: GrazingPlanType) {
  const items = Array.isArray(value) ? value : [];
  const normalized = items.map((item): NormalizedEventPayload => {
    const event = item as EventPayload;
    const type: GrazingEventType = isGrazingEventType(event.type) ? event.type : "grazing";
    const startDate = dateOrNull(event.startDate) ?? fallbackStart;
    const rawEndDate = dateOrNull(event.endDate) ?? fallbackEnd ?? startDate;
    const maxEndDate = planType === "perpetual" && startDate ? addDays(startDate, PERPETUAL_PLAN_DAYS - 1) : null;
    const clippedEndDate = rawEndDate && maxEndDate ? minIsoDate(rawEndDate, maxEndDate) : rawEndDate;
    const endDate = startDate && clippedEndDate && clippedEndDate < startDate ? startDate : clippedEndDate;
    const startTime = timeOrNull(event.startTime) ?? timeOrNull(event.startDate);
    const rawEndTime = timeOrNull(event.endTime) ?? timeOrNull(event.endDate);
    const endTime = startDate && endDate && startDate === endDate && startTime && rawEndTime && rawEndTime < startTime ? startTime : rawEndTime;
    const durationDays = planType === "perpetual" ? daysBetween(startDate, endDate) : positiveNumber(event.durationDays);
    return {
      type,
      title: cleanString(event.title, 180) ?? "Sự kiện chăn thả",
      startDate,
      endDate,
      note: cleanString(event.prerequisite ?? event.note, 300),
      metadata: {
        sourceId: cleanString(event.id, 120),
        prerequisiteId: cleanString(event.prerequisiteId, 120),
        dependencyType: cleanString(event.prerequisiteId, 120) ? "FS" : null,
        repeat: planType === "perpetual" || boolValue(event.repeat),
        recurrenceIndex: positiveNumber(event.recurrenceIndex),
        durationDays,
        startTime,
        endTime,
      },
    };
  });
  return alignFinishStartDependencies(normalized);
}

function normalizePaddocks(body: GrazingPayload, fallbackStart: string | null, fallbackEnd: string | null, planType: GrazingPlanType) {
  if (Array.isArray(body.paddocks)) {
    return body.paddocks
      .map((item) => {
        const paddock = item as PaddockPayload;
        const paddockId = cleanString(paddock.paddockId, 80);
        if (!paddockId) return null;
        return {
          paddockId,
          priority: parseIntValue(paddock.priority),
          rating: parseIntValue(paddock.rating),
          supply: cleanString(paddock.supply, 120),
          events: normalizeEvents(paddock.events, fallbackStart, fallbackEnd, planType),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  return stringList(body.paddockIds).map((paddockId) => ({
    paddockId,
    priority: 5,
    rating: 5,
    supply: null,
    events: [{
      type: "grazing" as const,
      title: "Chăn thả",
      startDate: fallbackStart,
      endDate: fallbackEnd ?? (planType === "perpetual" && fallbackStart ? addDays(fallbackStart, PERPETUAL_PLAN_DAYS - 1) : fallbackStart),
      note: null,
      metadata: { repeat: planType === "perpetual", durationDays: planType === "perpetual" ? PERPETUAL_PLAN_DAYS : null },
    }],
  }));
}

function makePlanCode(type: GrazingPlanType) {
  const prefix = { perpetual: "LD", seasonal: "MV", off_season: "TM" }[type];
  return `CT-${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 6).toUpperCase()}`;
}

function normalizePayload(body: GrazingPayload) {
  const type: GrazingPlanType = isGrazingPlanType(body.type) ? body.type : "seasonal";
  const status: GrazingStatus = isGrazingStatus(body.status) ? body.status : "active";
  const startDate = dateOrNull(body.startDate);
  const endDate = type === "perpetual" ? null : dateOrNull(body.endDate);
  const eventEndDate = type === "perpetual" && startDate ? addDays(startDate, PERPETUAL_PLAN_DAYS - 1) : endDate;
  return {
    code: cleanString(body.code, 80),
    name: cleanString(body.name, 180),
    type,
    status,
    startDate,
    endDate,
    season: cleanString(body.season, 120),
    manager: cleanString(body.manager, 120),
    note: cleanString(body.note, 1200),
    paddocks: normalizePaddocks(body, startDate, eventEndDate, type),
    groupIds: stringList(body.groupIds),
  };
}

async function getOwnerFarmId(ownerId: string, action: FarmAccessAction = "read") {
  return getAccessibleFarmId(ownerId, action);
}

function buildAbsoluteUrl(request: NextRequest, path: string) {
  const appUrl = cleanString(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL, 240);
  const origin = appUrl?.replace(/\/+$/, "") || request.nextUrl.origin;
  return `${origin}${path}`;
}

function dateText(value: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function planTypeText(type: GrazingPlanType) {
  if (type === "perpetual") return "Vĩnh viễn";
  if (type === "off_season") return "Trái mùa";
  return "Theo mùa";
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

function buildGrazingPlanEmail(options: { plan: GrazingPlan; assigneeName: string; planUrl: string }) {
  const subject = `Bạn được giao phụ trách kế hoạch chăn thả: ${options.plan.name}`;
  const endDate = options.plan.type === "perpetual" ? "Vĩnh viễn" : dateText(options.plan.endDate);
  const paddockRows = options.plan.paddocks.map((paddock) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(paddock.name)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(paddock.zoneTypeLabel)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(paddock.areaHa == null ? "-" : `${paddock.areaHa} ha`)}</td>
    </tr>`).join("");
  const eventRows = options.plan.events.map((event) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(event.paddockName || "-")}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(event.title)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(dateText(event.startDate))}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(dateText(event.endDate))}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(event.note || "-")}</td>
    </tr>`).join("");

  const html = `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f6f8;margin:0;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="width:720px;max-width:100%;background:#ffffff;border-collapse:collapse;box-shadow:0 1px 2px rgba(16,24,40,0.08);">
          <tr><td style="background:#1f7a4a;padding:28px;color:#ffffff;">
            <div style="font-size:26px;line-height:1.2;font-weight:800;">KetKat-EcoFarm</div>
            <div style="margin-top:8px;font-size:15px;line-height:1.5;">Thông báo kế hoạch chăn thả</div>
          </td></tr>
          <tr><td style="padding:30px 28px;">
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.35;color:#0f172a;">Bạn được giao phụ trách kế hoạch chăn thả</h1>
            <p style="margin:0 0 18px;font-size:16px;line-height:1.6;">Xin chào ${escapeHtml(options.assigneeName)},</p>
            <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Bạn được chọn làm người phụ trách kế hoạch <strong>${escapeHtml(options.plan.name)}</strong>.</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;">
              <tr><td style="padding:8px 0;color:#64748b;">Kiểu kế hoạch</td><td align="right" style="padding:8px 0;font-weight:700;">${escapeHtml(planTypeText(options.plan.type))}</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;">Ngày bắt đầu</td><td align="right" style="padding:8px 0;font-weight:700;">${escapeHtml(dateText(options.plan.startDate))}</td></tr>
              <tr><td style="padding:8px 0;color:#64748b;">Ngày kết thúc</td><td align="right" style="padding:8px 0;font-weight:700;">${escapeHtml(endDate)}</td></tr>
            </table>
            <h2 style="margin:0 0 10px;font-size:17px;color:#0f172a;">Khu vực trong kế hoạch</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;font-size:14px;">
              <tr><th align="left" style="padding:9px 10px;background:#f1f5f9;">Khu vực</th><th align="left" style="padding:9px 10px;background:#f1f5f9;">Loại</th><th align="right" style="padding:9px 10px;background:#f1f5f9;">Diện tích</th></tr>
              ${paddockRows || `<tr><td colspan="3" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">Chưa có khu vực.</td></tr>`}
            </table>
            <h2 style="margin:0 0 10px;font-size:17px;color:#0f172a;">Lịch công việc</h2>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 26px;border-collapse:collapse;font-size:14px;">
              <tr><th align="left" style="padding:9px 10px;background:#f1f5f9;">Khu vực</th><th align="left" style="padding:9px 10px;background:#f1f5f9;">Công việc</th><th align="left" style="padding:9px 10px;background:#f1f5f9;">Bắt đầu</th><th align="left" style="padding:9px 10px;background:#f1f5f9;">Kết thúc</th><th align="left" style="padding:9px 10px;background:#f1f5f9;">Công việc trước</th></tr>
              ${eventRows || `<tr><td colspan="5" style="padding:9px 10px;border-bottom:1px solid #e5e7eb;">Chưa có công việc.</td></tr>`}
            </table>
            <table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:0 auto;">
              <tr><td align="center" bgcolor="#1f7a4a" style="border-radius:5px;"><a href="${escapeHtml(options.planUrl)}" style="display:inline-block;padding:14px 22px;font-size:15px;line-height:1;color:#ffffff;text-decoration:none;font-weight:700;">Mở kế hoạch chăn thả</a></td></tr>
            </table>
            <p style="margin:22px 0 0;font-size:13px;line-height:1.6;word-break:break-all;color:#64748b;">${escapeHtml(options.planUrl)}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  const text = [
    `Bạn được giao phụ trách kế hoạch chăn thả: ${options.plan.name}`,
    `Kiểu kế hoạch: ${planTypeText(options.plan.type)}`,
    `Ngày bắt đầu: ${dateText(options.plan.startDate)}`,
    `Ngày kết thúc: ${endDate}`,
    "",
    "Lịch công việc:",
    ...options.plan.events.map((event) => `- ${event.paddockName || "-"} | ${event.title} | ${dateText(event.startDate)} - ${dateText(event.endDate)} | Trước: ${event.note || "-"}`),
    "",
    `Mở kế hoạch: ${options.planUrl}`,
  ].join("\n");
  return { subject, html, text };
}

async function notifyGrazingManager(input: { request: NextRequest; farmId: string; plan: GrazingPlan }) {
  const assignee = await findFarmUserByLabel(input.farmId, input.plan.manager);
  if (!assignee) return input.plan.manager ? `Không tìm thấy tài khoản người phụ trách "${input.plan.manager}" để gửi thông báo.` : null;

  const href = "/dashboard/chan-tha";
  await createUserNotification({
    userId: assignee.id,
    farmId: input.farmId,
    title: "Kế hoạch chăn thả mới",
    body: input.plan.name,
    tone: "info",
    module: "Chăn thả",
    href,
    metadata: { planId: input.plan.id },
  });

  if (!assignee.email) return "Đã gửi thông báo trong hệ thống, nhưng người phụ trách chưa có email.";

  const emailContent = buildGrazingPlanEmail({
    plan: input.plan,
    assigneeName: assignee.name,
    planUrl: buildAbsoluteUrl(input.request, href),
  });
  const mailResult = await sendMail({ to: assignee.email, ...emailContent });
  return mailResult.sent ? null : mailResult.reason || "Webmail/SMTP chua san sang.";
}

async function validateIds(farmId: string, paddockIds: string[], groupIds: string[]) {
  const [paddockRs, groupRs] = await Promise.all([
    paddockIds.length
      ? db.query<{ id: string }>(
          `select id::text from du_lieu.khu_vuc
           where trang_trai_id = $1
             and id::text = any($2::text[])
             and coalesce(lower(trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')`,
          [farmId, paddockIds]
        )
      : Promise.resolve({ rows: [] as { id: string }[] }),
    groupIds.length
      ? db.query<{ id: string }>(`select id::text from du_lieu.nhom_vat_nuoi where trang_trai_id = $1 and id::text = any($2::text[])`, [farmId, groupIds])
      : Promise.resolve({ rows: [] as { id: string }[] }),
  ]);
  if (paddockRs.rows.length !== paddockIds.length) return "Có ô chăn thả không thuộc trang trại hiện tại.";
  if (groupRs.rows.length !== groupIds.length) return "Có nhóm vật nuôi không thuộc trang trại hiện tại.";
  return null;
}

async function insertPlanChildren(client: PoolClient, planId: string, payload: ReturnType<typeof normalizePayload>) {
  for (const paddock of payload.paddocks) {
    await client.query(
      `insert into du_lieu.ke_hoach_chan_tha_khu_vuc (ke_hoach_id, khu_vuc_id, do_uu_tien, danh_gia, dien_tich_ha, metadata_json)
       select $1::uuid, k.id, $3, $4, k.dien_tich_ha, $5::jsonb
       from du_lieu.khu_vuc k
       where k.id::text = $2
         and coalesce(lower(k.trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')
       on conflict (ke_hoach_id, khu_vuc_id)
       do update set do_uu_tien = excluded.do_uu_tien, danh_gia = excluded.danh_gia, metadata_json = excluded.metadata_json`,
      [planId, paddock.paddockId, paddock.priority, paddock.rating, JSON.stringify({ supply: paddock.supply })]
    );

    for (const event of paddock.events) {
      await client.query(
        `insert into du_lieu.su_kien_chan_tha (
          ke_hoach_id, khu_vuc_id, nhom_vat_nuoi_id, loai_su_kien, tieu_de, trang_thai, ngay_bat_dau, ngay_ket_thuc, ghi_chu, metadata_json
        )
        values ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
        [
          planId,
          paddock.paddockId,
          payload.groupIds[0] ?? null,
          event.type,
          event.title,
          payload.status,
          event.startDate,
          event.endDate,
          event.note,
          JSON.stringify(event.metadata),
        ]
      );
    }
  }

  for (const groupId of payload.groupIds) {
    await client.query(
      `insert into du_lieu.ke_hoach_chan_tha_nhom_vat_nuoi (ke_hoach_id, nhom_vat_nuoi_id, so_luong_du_kien)
       select $1::uuid, n.id, n.so_luong from du_lieu.nhom_vat_nuoi n where n.id::text = $2
       on conflict (ke_hoach_id, nhom_vat_nuoi_id) do nothing`,
      [planId, groupId]
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuRequest(request) || layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    await ensureGrazingSchema();
    const farmId = await getOwnerFarmId(ownerId, "read");
    if (!farmId) return NextResponse.json({ plans: [], paddocks: [], groups: [] });

    const [plans, paddocks, groups] = await Promise.all([loadGrazingPlans(farmId), loadGrazingPaddocks(farmId), loadGrazingGroups(farmId)]);
    return NextResponse.json({ plans, paddocks, groups });
  } catch (error) {
    return NextResponse.json({ message: "Không thể tải dữ liệu chăn thả.", error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuRequest(request) || layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Phiên đăng nhập không hợp lệ." }, { status: 401 });

    await ensureGrazingSchema();
    const farmId = await getOwnerFarmId(ownerId, "write");
    if (!farmId) return NextResponse.json({ message: "Không có quyền thêm kế hoạch chăn thả." }, { status: 403 });

    const payload = normalizePayload((await request.json()) as GrazingPayload);
    if (!payload.name) return NextResponse.json({ message: "Vui lòng nhập tên kế hoạch chăn thả." }, { status: 400 });
    if (payload.type !== "perpetual" && !payload.endDate) {
      return NextResponse.json({ message: "Vui lòng nhập ngày kết thúc cho kế hoạch theo mùa hoặc trái mùa." }, { status: 400 });
    }
    if (payload.startDate && payload.endDate && payload.endDate < payload.startDate) {
      return NextResponse.json({ message: "Ngày kết thúc phải sau ngày bắt đầu." }, { status: 400 });
    }

    const idError = await validateIds(farmId, payload.paddocks.map((item) => item.paddockId), payload.groupIds);
    if (idError) return NextResponse.json({ message: idError }, { status: 400 });

    const planId = randomUUID();
    const client = await db.connect();
    try {
      await client.query("begin");
      await client.query(
        `insert into du_lieu.ke_hoach_chan_tha (
          id, trang_trai_id, ma_ke_hoach, ten_ke_hoach, kieu_ke_hoach, trang_thai,
          ngay_bat_dau, ngay_ket_thuc, mua_vu, nguoi_phu_trach, ghi_chu, metadata_json
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
        [
          planId,
          farmId,
          payload.code ?? makePlanCode(payload.type),
          payload.name,
          payload.type,
          payload.status,
          payload.startDate,
          payload.endDate,
          payload.season,
          payload.manager,
          payload.note,
          JSON.stringify({ source: "grazing-module" }),
        ]
      );
      await insertPlanChildren(client, planId, payload);
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const plan = (await loadGrazingPlans(farmId)).find((item) => item.id === planId);
    const notificationWarning = plan ? await notifyGrazingManager({ request, farmId, plan }).catch((error) => String(error)) : null;
    return NextResponse.json({
      message: notificationWarning ? `Đã thêm kế hoạch chăn thả. ${notificationWarning}` : "Đã thêm kế hoạch chăn thả.",
      plan,
      notificationWarning,
    });
  } catch (error) {
    const message = String(error).includes("ke_hoach_chan_tha_trang_trai_id_ma_ke_hoach_key")
      ? "Mã kế hoạch chăn thả đã tồn tại."
      : "Không thể thêm kế hoạch chăn thả.";
    return NextResponse.json({ message, error: String(error) }, { status: 500 });
  }
}
