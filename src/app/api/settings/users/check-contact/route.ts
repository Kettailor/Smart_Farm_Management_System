import { NextRequest, NextResponse } from "next/server";
import { layOwnerIdTuServerCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireFarmAccess } from "@/lib/farm-access";
import { FARM_INVITATION_REINVITE_COOLDOWN_DAYS, expireFarmInvitations } from "@/lib/farm-invitations";
import { ensureSettingsSchema } from "@/lib/settings-schema";

type ContactCheckPayload = {
  farm_id?: string | null;
  email?: string;
  phone?: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUNTRY_ONLY_PHONE_DIGITS = new Set(["1", "61", "84"]);
const MIN_PHONE_DIGITS = 7;

class ContactCheckError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getPhoneDigits(value: string) {
  return value.replace(/\D/g, "");
}

function hasPhoneValue(value: string) {
  const digits = getPhoneDigits(value);
  return Boolean(digits && !COUNTRY_ONLY_PHONE_DIGITS.has(digits));
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

function validatePhone(value: string) {
  if (!hasPhoneValue(value)) return;
  if (getPhoneDigits(value).length < MIN_PHONE_DIGITS) {
    throw new ContactCheckError("Số điện thoại không hợp lệ.", 400);
  }
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

    const body = (await request.json()) as ContactCheckPayload;
    const farmId = cleanText(body.farm_id);
    const email = cleanText(body.email).toLowerCase();
    const phone = cleanText(body.phone);

    if (!farmId) {
      return NextResponse.json({ available: false, message: "Không tìm thấy trang trại để kiểm tra liên hệ." }, { status: 400 });
    }

    const access = await requireFarmAccess(ownerId, "users", farmId);
    if (!access) {
      return NextResponse.json({ available: false, message: "Bạn không có quyền kiểm tra liên hệ cho trang trại này." }, { status: 403 });
    }

    await expireFarmInvitations(farmId);

    const fieldErrors: { email?: string; phone?: string } = {};
    let hasPendingInvite = false;

    if (email) {
      if (!EMAIL_PATTERN.test(email)) {
        fieldErrors.email = "Email không hợp lệ.";
      } else {
        const existingEmail = await db.query(
          `select id
           from du_lieu.nguoi_dung
           where lower(email) = $1
           limit 1`,
          [email]
        );
        if ((existingEmail.rowCount ?? 0) > 0) {
          fieldErrors.email = "Email đã tồn tại trong hệ thống.";
        }

        const pendingInvite = await db.query(
          `select id
           from du_lieu.loi_moi_trang_trai
           where trang_trai_id = $1
             and lower(email) = $2
             and lower(trang_thai) = 'pending'
           limit 1`,
          [farmId, email]
        );
        hasPendingInvite = (pendingInvite.rowCount ?? 0) > 0;

        const blockedInvite = await db.query(
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
        if (!fieldErrors.email && !hasPendingInvite && (blockedInvite.rowCount ?? 0) > 0) {
          const status = String(blockedInvite.rows[0]?.trang_thai ?? "").toLowerCase();
          const statusText = status === "declined" ? "đã từ chối" : "đã hết hạn";
          const availableAt = formatInviteCooldownDate(blockedInvite.rows[0]?.available_at);
          fieldErrors.email = availableAt
            ? `Email này ${statusText} lời mời gần đây. Chỉ có thể mời lại từ ${availableAt}.`
            : `Email này ${statusText} lời mời gần đây. Chỉ có thể mời lại sau ${FARM_INVITATION_REINVITE_COOLDOWN_DAYS} ngày.`;
        }
      }
    }

    if (hasPhoneValue(phone)) {
      validatePhone(phone);
      const phoneLookupDigits = buildPhoneLookupDigits(phone);
      if (phoneLookupDigits.length > 0) {
        const existingPhone = await db.query(
          `select id
           from du_lieu.nguoi_dung
           where nullif(so_dien_thoai, '') is not null
             and regexp_replace(so_dien_thoai, '\\D', '', 'g') = any($1::text[])
           limit 1`,
          [phoneLookupDigits]
        );
        if ((existingPhone.rowCount ?? 0) > 0) {
          fieldErrors.phone = "Số điện thoại đã tồn tại trong hệ thống.";
        }
      }
    }

    if (fieldErrors.email || fieldErrors.phone) {
      return NextResponse.json(
        {
          available: false,
          fields: fieldErrors,
          message: fieldErrors.email || fieldErrors.phone || "Thông tin liên hệ đã tồn tại.",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      available: true,
      pendingInvite: hasPendingInvite,
      message: hasPendingInvite
        ? "Email đã có lời mời đang chờ. Khi lưu, hệ thống sẽ gửi lại lời mời mới."
        : "Thông tin liên hệ có thể sử dụng.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        message: error instanceof Error ? error.message : "Không thể kiểm tra thông tin liên hệ.",
        error: String(error),
      },
      { status: error instanceof ContactCheckError ? error.status : 500 }
    );
  }
}
