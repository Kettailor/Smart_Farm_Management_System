import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { layOwnerIdTuServerCookie } from "@/lib/auth";
import { buildAppUrl } from "@/lib/app-path";
import { db } from "@/lib/db";
import { requireFarmAccess } from "@/lib/farm-access";
import {
  FARM_INVITATION_EXPIRY_DAYS,
  FARM_INVITATION_REINVITE_COOLDOWN_DAYS,
  expireDeletedFarmAccessInvitations,
  expireFarmInvitations,
} from "@/lib/farm-invitations";
import { buildFarmInvitationEmail, sendMail } from "@/lib/mail";
import { loadSettingsProfile } from "@/lib/settings-overview";
import { ensureFarmSettingsDefaults, ensureSettingsSchema } from "@/lib/settings-schema";

type RoleCode = "none" | "viewer" | "editor" | "admin";

type AddUserPayload = {
  farm_id?: string | null;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  language?: string;
  account_enabled?: boolean;
  base_role?: RoleCode;
  farm_role?: RoleCode;
};

type UpdateUserPayload = AddUserPayload & {
  member_id?: string | null;
  user_id?: string | null;
  status?: string | null;
};

type DeleteUserPayload = {
  farm_id?: string | null;
  member_id?: string | null;
  user_id?: string | null;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_CODES = new Set<RoleCode>(["none", "viewer", "editor", "admin"]);
const COUNTRY_ONLY_PHONE_DIGITS = new Set(["1", "61", "84"]);
const MIN_PHONE_DIGITS = 7;

class AddUserError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value: unknown): RoleCode {
  const cleanValue = cleanText(value).toLowerCase() as RoleCode;
  return ROLE_CODES.has(cleanValue) ? cleanValue : "none";
}

function getEffectiveRole(baseRole: RoleCode, farmRole: RoleCode) {
  return farmRole !== "none" ? farmRole : baseRole !== "none" ? baseRole : null;
}

function normalizeMemberStatus(value: unknown) {
  const cleanValue = cleanText(value).toLowerCase();
  return cleanValue === "disabled" || cleanValue === "inactive" ? "disabled" : "active";
}

function buildFullName(firstName: string, lastName: string, email: string) {
  const fullName = `${firstName} ${lastName}`.trim();
  return fullName || email.split("@")[0] || "Nguoi dung";
}

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function buildPhoneLookupDigits(value: string) {
  const rawDigits = getPhoneDigits(value);
  if (!rawDigits || COUNTRY_ONLY_PHONE_DIGITS.has(rawDigits)) return [];

  const digits = new Set([rawDigits]);
  if (rawDigits.startsWith("840") && rawDigits.length > 3) {
    digits.add(`84${rawDigits.slice(3)}`);
    digits.add(`0${rawDigits.slice(3)}`);
  } else if (rawDigits.startsWith("84") && rawDigits.length > 2) {
    digits.add(`0${rawDigits.slice(2)}`);
    digits.add(`840${rawDigits.slice(2)}`);
  } else if (rawDigits.startsWith("0") && rawDigits.length > 1) {
    digits.add(`84${rawDigits.slice(1)}`);
    digits.add(`840${rawDigits.slice(1)}`);
  }

  return Array.from(digits).filter((digitsValue) => digitsValue.length >= MIN_PHONE_DIGITS);
}

function normalizePhoneForStorage(value: string) {
  const rawDigits = getPhoneDigits(value);
  if (!rawDigits || COUNTRY_ONLY_PHONE_DIGITS.has(rawDigits)) return null;
  if (rawDigits.length < MIN_PHONE_DIGITS) {
    throw new AddUserError("Số điện thoại không hợp lệ.", 400);
  }

  return value.trim().replace(/\s+/g, " ");
}

function isPgUniqueViolation(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "23505";
}

function getFirstHeaderValue(request: NextRequest, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function getRequestOrigin(request: NextRequest) {
  const configuredOrigin = process.env.APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) return configuredOrigin.replace(/\/+$/, "");

  const host = getFirstHeaderValue(request, "x-forwarded-host") || getFirstHeaderValue(request, "host") || request.nextUrl.host;
  const protocol = getFirstHeaderValue(request, "x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

function buildInvitationUrl(request: NextRequest, inviteToken: string, email: string) {
  const url = new URL(buildAppUrl(getRequestOrigin(request), "/register"));
  url.searchParams.set("invite", inviteToken);
  url.searchParams.set("email", email);
  return url.toString();
}

function buildInvitationDeclineUrl(request: NextRequest, inviteToken: string) {
  const url = new URL(buildAppUrl(getRequestOrigin(request), "/invitation/decline"));
  url.searchParams.set("token", inviteToken);
  return url.toString();
}

function formatInviteCooldownDate(value: unknown) {
  if (!value) return null;
  const date = new Date(value as string | Date);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("vi-VN");
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });

    await ensureSettingsSchema();

    const body = (await request.json()) as AddUserPayload;
    const farmId = cleanText(body.farm_id);
    const firstName = cleanText(body.first_name);
    const lastName = cleanText(body.last_name);
    const email = cleanText(body.email).toLowerCase();
    const phone = cleanText(body.phone);
    const normalizedPhone = normalizePhoneForStorage(phone);
    const phoneLookupDigits = buildPhoneLookupDigits(phone);
    const language = cleanText(body.language) || "vi-VN";
    const accountEnabled = body.account_enabled !== false;
    const baseRole = normalizeRole(body.base_role);
    const farmRole = normalizeRole(body.farm_role);
    const effectiveRole = getEffectiveRole(baseRole, farmRole);

    if (!farmId) {
      return NextResponse.json({ message: "Không tìm thấy trang trại để phân quyền." }, { status: 400 });
    }
    if (!email || !EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ message: "Email không hợp lệ." }, { status: 400 });
    }
    if (!effectiveRole) {
      return NextResponse.json({ message: "Vui lòng chọn ít nhất một vai trò cho người dùng." }, { status: 400 });
    }

    let inviteMailSent = false;
    let inviteMailWarning: string | null = null;
    let inviteMailOptions: Parameters<typeof sendMail>[0] | null = null;
    let replacedPendingInvite = false;
    const client = await db.connect();
    try {
      await client.query("begin");

      const access = await requireFarmAccess(ownerId, "users", farmId);
      if (!access) {
        throw new AddUserError("Bạn không có quyền phân quyền cho trang trại này.", 403);
      }
      await expireFarmInvitations(farmId);

      const farm = await client.query(
        `select t.id,
                t.ten_trang_trai as farm_name,
                coalesce(nullif(u.ho_ten, ''), u.email, 'KetKat-EcoFarm') as owner_name
         from du_lieu.trang_trai t
         join du_lieu.nguoi_dung u on u.id = t.chu_so_huu_id
         where t.id = $1
         limit 1`,
        [farmId]
      );
      if (farm.rowCount === 0) {
        throw new AddUserError("Bạn không có quyền phân quyền cho trang trại này.", 403);
      }
      const farmRow = farm.rows[0] as { farm_name?: string | null; owner_name?: string | null };

      await ensureFarmSettingsDefaults(farmId, access.ownerId);

      const existingUser = await client.query(
        `select id::text, email, so_dien_thoai
         from du_lieu.nguoi_dung
         where lower(email) = $1
         order by created_at asc nulls last, id asc
         limit 1`,
        [email]
      );
      const existingUserId = existingUser.rows[0]?.id ? String(existingUser.rows[0].id) : null;
      if (existingUserId) {
        throw new AddUserError("Email đã tồn tại trong hệ thống. Vui lòng dùng email khác.", 409);
      }

      const pendingInvite = await client.query(
        `select id
         from du_lieu.loi_moi_trang_trai
         where trang_trai_id = $1
           and lower(email) = $2
           and lower(trang_thai) = 'pending'
         limit 1`,
        [farmId, email]
      );
      replacedPendingInvite = (pendingInvite.rowCount ?? 0) > 0;

      const blockedInvite = await client.query(
        `select trang_thai, updated_at, updated_at + interval '1 month' as available_at
         from du_lieu.loi_moi_trang_trai
         where trang_trai_id = $1
           and lower(email) = $2
           and lower(trang_thai) in ('expired', 'declined')
           and updated_at > now() - interval '1 month'
         order by updated_at desc nulls last
         limit 1`,
        [farmId, email]
      );
      if (!replacedPendingInvite && (blockedInvite.rowCount ?? 0) > 0) {
        const status = String(blockedInvite.rows[0]?.trang_thai ?? "").toLowerCase();
        const statusText = status === "declined" ? "đã từ chối" : "đã hết hạn";
        const availableAt = formatInviteCooldownDate(blockedInvite.rows[0]?.available_at);
        throw new AddUserError(
          availableAt
            ? `Email này ${statusText} lời mời gần đây. Chỉ có thể mời lại từ ${availableAt}.`
            : `Email này ${statusText} lời mời gần đây. Chỉ có thể mời lại sau ${FARM_INVITATION_REINVITE_COOLDOWN_DAYS} ngày.`,
          409
        );
      }

      if (phoneLookupDigits.length > 0) {
        const duplicatedPhone = await client.query(
          `select id::text, email
           from du_lieu.nguoi_dung
           where nullif(so_dien_thoai, '') is not null
             and regexp_replace(so_dien_thoai, '\\D', '', 'g') = any($1::text[])
           limit 1`,
          [phoneLookupDigits]
        );

        if ((duplicatedPhone.rowCount ?? 0) > 0) {
          throw new AddUserError("Số điện thoại đã tồn tại trong hệ thống. Vui lòng dùng số khác.", 409);
        }
      }

      const memberCount = await client.query(
        `select
           (
             (select count(*)::int from du_lieu.thanh_vien_trang_trai where trang_trai_id = $1)
             +
             (select count(*)::int
              from du_lieu.loi_moi_trang_trai
              where trang_trai_id = $1
                and lower(coalesce(trang_thai, 'pending')) = 'pending'
                and not (lower(email) = $2 and lower(coalesce(trang_thai, 'pending')) = 'pending'))
           ) as member_count`,
        [farmId, email]
      );
      if (Number(memberCount.rows[0]?.member_count ?? 0) >= 3) {
        throw new AddUserError("Trang trại đã đạt giới hạn 3 người dùng/lời mời.", 409);
      }

      const fullName = buildFullName(firstName, lastName, email);

      const role = await client.query(
        `select id, ten_vai_tro
         from du_lieu.vai_tro_trang_trai
         where trang_trai_id = $1 and ma_vai_tro = $2
         limit 1`,
        [farmId, effectiveRole]
      );
      const roleId = role.rows[0]?.id ? String(role.rows[0].id) : null;
      const roleName = role.rows[0]?.ten_vai_tro ? String(role.rows[0].ten_vai_tro) : effectiveRole;
      if (!roleId) {
        throw new AddUserError("Vai trò được chọn chưa được cấu hình cho trang trại.", 400);
      }

      const inviteToken = randomBytes(32).toString("base64url");
      const supersededInvites = await client.query(
        `update du_lieu.loi_moi_trang_trai
         set trang_thai = 'superseded',
             updated_at = now()
         where trang_trai_id = $1
           and lower(email) = $2
           and lower(trang_thai) = 'pending'
         returning id`,
        [farmId, email]
      );
      replacedPendingInvite = replacedPendingInvite || (supersededInvites.rowCount ?? 0) > 0;
      await client.query(
        `insert into du_lieu.loi_moi_trang_trai
           (id, trang_trai_id, email, ho_ten, so_dien_thoai, ngon_ngu, vai_tro_id, trang_thai, token, nguoi_moi_id, het_han_luc, metadata_json)
         values ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, $9, now() + ($10::int * interval '1 day'), $11::jsonb)`,
        [
          randomUUID(),
          farmId,
          email,
          fullName,
          normalizedPhone,
          language,
          roleId,
          inviteToken,
          ownerId,
          FARM_INVITATION_EXPIRY_DAYS,
          JSON.stringify({ base_role: baseRole, farm_role: farmRole, account_enabled: accountEnabled }),
        ]
      );

      const inviteUrl = buildInvitationUrl(request, inviteToken, email);
      const declineUrl = buildInvitationDeclineUrl(request, inviteToken);
      const emailContent = buildFarmInvitationEmail({
        inviteUrl,
        declineUrl,
        invitedEmail: email,
        inviterName: String(farmRow.owner_name || "KetKat-EcoFarm"),
        farmName: String(farmRow.farm_name || "trang trại"),
        roleName,
        expiresInDays: FARM_INVITATION_EXPIRY_DAYS,
        supportEmail: process.env.SUPPORT_EMAIL?.trim() || null,
        supportPhone: process.env.SUPPORT_PHONE?.trim() || null,
        logoUrl: buildAppUrl(getRequestOrigin(request), "/assets/logo_ketkatecofarm.png"),
      });
      inviteMailOptions = { to: email, ...emailContent };

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    if (inviteMailOptions) {
      const mailResult = await sendMail(inviteMailOptions);
      inviteMailSent = mailResult.sent;
      inviteMailWarning = mailResult.sent ? null : mailResult.reason || "Webmail/SMTP chua san sang.";
    }

    const profile = await loadSettingsProfile(ownerId);
    const inviteActionMessage = replacedPendingInvite ? "Đã tạo lại lời mời" : "Đã tạo lời mời";
    const message = inviteMailSent
      ? `${inviteActionMessage}, lưu thông tin liên hệ và gửi email xác nhận.`
      : inviteMailWarning
        ? `${inviteActionMessage}, nhưng chưa gửi được email xác nhận: ${inviteMailWarning}`
        : `${inviteActionMessage}.`;

    return NextResponse.json({ message, profile, inviteMailSent, inviteMailWarning });
  } catch (error) {
    const status = error instanceof AddUserError ? error.status : isPgUniqueViolation(error) ? 409 : 500;
    const message = isPgUniqueViolation(error)
      ? "Email hoặc số điện thoại đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."
      : error instanceof Error
        ? error.message
        : "Không thể thêm người dùng.";

    return NextResponse.json(
      { message, error: String(error) },
      { status }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });

    await ensureSettingsSchema();

    const body = (await request.json()) as UpdateUserPayload;
    const farmId = cleanText(body.farm_id);
    const memberId = cleanText(body.member_id);
    const userId = cleanText(body.user_id);
    const firstName = cleanText(body.first_name);
    const lastName = cleanText(body.last_name);
    const language = cleanText(body.language) || "vi-VN";
    const status = normalizeMemberStatus(body.status ?? (body.account_enabled === false ? "disabled" : "active"));
    const baseRole = normalizeRole(body.base_role);
    const farmRole = normalizeRole(body.farm_role);
    const effectiveRole = getEffectiveRole(baseRole, farmRole);

    if (!farmId || (!memberId && !userId)) {
      return NextResponse.json({ message: "Không tìm thấy thành viên để cập nhật." }, { status: 400 });
    }
    const client = await db.connect();
    try {
      await client.query("begin");

      const access = await requireFarmAccess(ownerId, "users", farmId);
      const readAccess = access ?? (await requireFarmAccess(ownerId, "read", farmId));
      if (!readAccess) {
        throw new AddUserError("Bạn không có quyền truy cập trang trại này.", 403);
      }

      const member = await client.query(
        `select tv.id::text as member_id,
                tv.nguoi_dung_id::text as user_id,
                u.email,
                t.chu_so_huu_id::text as farm_owner_id
         from du_lieu.thanh_vien_trang_trai tv
         join du_lieu.nguoi_dung u on u.id = tv.nguoi_dung_id
         join du_lieu.trang_trai t on t.id = tv.trang_trai_id
         where tv.trang_trai_id = $1
           and (($2::text <> '' and tv.id::text = $2::text) or ($3::text <> '' and tv.nguoi_dung_id::text = $3::text))
         limit 1
         for update`,
        [farmId, memberId, userId]
      );
      const memberRow = member.rows[0] as { member_id?: string; user_id?: string; email?: string | null; farm_owner_id?: string } | undefined;
      if (!memberRow?.user_id) {
        throw new AddUserError("Không tìm thấy thành viên trong trang trại.", 404);
      }
      const isSelfUpdate = memberRow.user_id === ownerId;
      if (!access && !isSelfUpdate) {
        throw new AddUserError("Bạn không có quyền cập nhật phân quyền cho trang trại này.", 403);
      }

      if (isSelfUpdate) {
        await client.query(
          `update du_lieu.nguoi_dung
           set ho_ten = $2,
               ngon_ngu = $3,
               updated_at = now()
           where id::text = $1`,
          [memberRow.user_id, buildFullName(firstName, lastName, String(memberRow.email ?? "")), language]
        );

        await client.query("commit");
        const profile = await loadSettingsProfile(ownerId);
        return NextResponse.json({ message: "Đã cập nhật thông tin cá nhân.", profile });
      }

      if (!effectiveRole) {
        throw new AddUserError("Vui lòng chọn vai trò cho người dùng.", 400);
      }
      if (memberRow.farm_owner_id === memberRow.user_id) {
        throw new AddUserError("Không thể chỉnh sửa vai trò chủ trang trại tại màn hình này.", 400);
      }

      const role = await client.query(
        `select id
         from du_lieu.vai_tro_trang_trai
         where trang_trai_id = $1 and ma_vai_tro = $2
         limit 1`,
        [farmId, effectiveRole]
      );
      const roleId = role.rows[0]?.id ? String(role.rows[0].id) : null;
      if (!roleId) {
        throw new AddUserError("Vai trò được chọn chưa được cấu hình cho trang trại.", 400);
      }

      await client.query(
        `update du_lieu.nguoi_dung
         set ho_ten = $2,
             ngon_ngu = $3,
             trang_thai = $4,
             updated_at = now()
         where id::text = $1`,
        [memberRow.user_id, buildFullName(firstName, lastName, String(memberRow.email ?? "")), language, status]
      );

      await client.query(
        `update du_lieu.thanh_vien_trang_trai
         set vai_tro_id = $3,
             trang_thai = $4,
             metadata_json = coalesce(metadata_json, '{}'::jsonb) || $5::jsonb,
             updated_at = now()
         where trang_trai_id = $1 and nguoi_dung_id::text = $2`,
        [
          farmId,
          memberRow.user_id,
          roleId,
          status,
          JSON.stringify({ base_role: baseRole, farm_role: farmRole, source: "settings" }),
        ]
      );

      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const profile = await loadSettingsProfile(ownerId);
    return NextResponse.json({ message: "Đã cập nhật người dùng và phân quyền.", profile });
  } catch (error) {
    const status = error instanceof AddUserError ? error.status : isPgUniqueViolation(error) ? 409 : 500;
    const message = isPgUniqueViolation(error)
      ? "Email hoặc số điện thoại đã tồn tại trong hệ thống. Vui lòng kiểm tra lại."
      : error instanceof Error
        ? error.message
        : "Không thể cập nhật người dùng.";

    return NextResponse.json({ message, error: String(error) }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });

    await ensureSettingsSchema();

    const body = (await request.json()) as DeleteUserPayload;
    const farmId = cleanText(body.farm_id);
    const memberId = cleanText(body.member_id);
    const userId = cleanText(body.user_id);
    if (!farmId || (!memberId && !userId)) {
      return NextResponse.json({ message: "Không tìm thấy thành viên hoặc lời mời để xóa." }, { status: 400 });
    }

    let deletedInvite = false;
    const client = await db.connect();
    try {
      await client.query("begin");

      const access = await requireFarmAccess(ownerId, "users", farmId);
      if (!access) {
        throw new AddUserError("Bạn không có quyền xóa phân quyền cho trang trại này.", 403);
      }

      const inviteId = memberId.startsWith("invite-") ? memberId.slice("invite-".length) : "";
      if (inviteId && !userId) {
        const expiredCount = await expireDeletedFarmAccessInvitations(client, {
          farmId,
          inviteId,
          deletedByUserId: ownerId,
          reason: "owner_deleted_invite",
        });
        if (expiredCount === 0) {
          throw new AddUserError("Không tìm thấy lời mời trong trang trại.", 404);
        }
        deletedInvite = true;
        await client.query("commit");
      } else {
      const member = await client.query(
        `select tv.id::text as member_id,
                tv.nguoi_dung_id::text as user_id,
                u.email,
                t.chu_so_huu_id::text as farm_owner_id
         from du_lieu.thanh_vien_trang_trai tv
         join du_lieu.nguoi_dung u on u.id = tv.nguoi_dung_id
         join du_lieu.trang_trai t on t.id = tv.trang_trai_id
         where tv.trang_trai_id = $1
           and (($2::text <> '' and tv.id::text = $2::text) or ($3::text <> '' and tv.nguoi_dung_id::text = $3::text))
         limit 1
         for update`,
        [farmId, memberId, userId]
      );
      const memberRow = member.rows[0] as { member_id?: string; user_id?: string; email?: string | null; farm_owner_id?: string } | undefined;
      if (!memberRow?.member_id || !memberRow.user_id) {
        throw new AddUserError("Không tìm thấy thành viên trong trang trại.", 404);
      }
      if (memberRow.farm_owner_id === memberRow.user_id) {
        throw new AddUserError("Không thể xóa chủ trang trại khỏi danh sách phân quyền.", 400);
      }
      if (memberRow.user_id === ownerId) {
        throw new AddUserError("Không thể tự xóa quyền truy cập của tài khoản đang đăng nhập.", 400);
      }

      await client.query(
        `delete from du_lieu.thanh_vien_trang_trai
         where id::text = $1 and trang_trai_id = $2`,
        [memberRow.member_id, farmId]
      );

      if (memberRow.email) {
        await expireDeletedFarmAccessInvitations(client, {
          farmId,
          email: memberRow.email,
          deletedByUserId: ownerId,
          deletedMemberId: memberRow.member_id,
          reason: "owner_deleted_member",
        });
      }

      await client.query("commit");
      }
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    const profile = await loadSettingsProfile(ownerId);
    return NextResponse.json({
      message: deletedInvite ? "Đã xóa lời mời và vô hiệu hóa liên kết email." : "Đã xóa quyền truy cập của người dùng.",
      profile,
    });
  } catch (error) {
    const status = error instanceof AddUserError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Không thể xóa người dùng.";
    return NextResponse.json({ message, error: String(error) }, { status });
  }
}
