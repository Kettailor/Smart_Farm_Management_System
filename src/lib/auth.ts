import { createHash, createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "crypto";
import { cookies as nextCookies } from "next/headers";
import { NextRequest } from "next/server";
import { APP_BASE_PATH } from "@/lib/app-path";
import { db } from "@/lib/db";
import {
  docPayloadTokenXacThuc,
  layBiMatXacThuc,
  payloadTokenConHan,
  TEN_COOKIE_XAC_THUC,
  THOI_GIAN_DANG_NHAP_GIAY,
} from "@/lib/auth-token";

export { TEN_COOKIE_XAC_THUC } from "@/lib/auth-token";

const PBKDF2_VONG_LAP = 210000;
const PBKDF2_DO_DAI = 32;

export function taoMatKhauHash(matKhau: string) {
  const salt = randomBytes(16).toString("hex");
  const key = pbkdf2Sync(matKhau, salt, PBKDF2_VONG_LAP, PBKDF2_DO_DAI, "sha256").toString("hex");
  return `pbkdf2$${PBKDF2_VONG_LAP}$${salt}$${key}`;
}

export function kiemTraMatKhau(matKhauNhap: string, hashDaLuu: string) {
  if (hashDaLuu.startsWith("pbkdf2$")) {
    const [, vongLapRaw, salt, keyHex] = hashDaLuu.split("$");
    const vongLap = Number(vongLapRaw);
    if (!Number.isFinite(vongLap) || !salt || !keyHex) return false;
    const keyTinh = pbkdf2Sync(matKhauNhap, salt, vongLap, PBKDF2_DO_DAI, "sha256");
    const keyDaLuu = Buffer.from(keyHex, "hex");
    return keyDaLuu.length === keyTinh.length && timingSafeEqual(keyDaLuu, keyTinh);
  }

  const legacyMd5 = createHash("md5").update(matKhauNhap).digest("hex");
  return legacyMd5 === hashDaLuu;
}

export function hashDangLegacyMd5(hashDaLuu: string) {
  return !hashDaLuu.startsWith("pbkdf2$");
}

export function taoTokenXacThuc(ownerId: string) {
  const payload = { owner_id: ownerId, exp: Math.floor(Date.now() / 1000) + THOI_GIAN_DANG_NHAP_GIAY };
  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", layBiMatXacThuc()).update(payloadBase64).digest("base64url");
  return `${payloadBase64}.${signature}`;
}

export function giaiMaTokenXacThuc(token?: string | null): string | null {
  if (!token || !token.includes(".")) return null;
  const [payloadBase64, signature] = token.split(".");
  const signatureHopLe = createHmac("sha256", layBiMatXacThuc()).update(payloadBase64).digest("base64url");
  if (signature !== signatureHopLe) return null;

  const payload = docPayloadTokenXacThuc(payloadBase64);
  if (!payloadTokenConHan(payload)) return null;
  return payload?.owner_id ?? null;
}

export function layOwnerIdTuRequest(request: NextRequest): string | null {
  const token = request.cookies.get(TEN_COOKIE_XAC_THUC)?.value;
  return giaiMaTokenXacThuc(token);
}

export function layOwnerIdTuServerCookie(): string | null {
  const token = nextCookies().get(TEN_COOKIE_XAC_THUC)?.value;
  return giaiMaTokenXacThuc(token);
}

export type TaiKhoanDangNhap = {
  id: string;
  fullName: string;
  email: string;
};

export async function layTaiKhoanDangNhapTuServerCookie(): Promise<TaiKhoanDangNhap | null> {
  const ownerId = layOwnerIdTuServerCookie();
  if (!ownerId) return null;

  const result = await db.query(
    `select id::text, ho_ten, email
     from du_lieu.nguoi_dung
     where id = $1
       and coalesce(nullif(trang_thai, ''), 'active') <> 'disabled'
     limit 1`,
    [ownerId]
  );
  const row = result.rows[0] as { id?: string; ho_ten?: string | null; email?: string | null } | undefined;
  if (!row?.id || !row.email) return null;

  return {
    id: row.id,
    fullName: row.ho_ten ?? "",
    email: row.email,
  };
}

export const cauHinhCookieXacThuc = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: APP_BASE_PATH || "/",
  maxAge: THOI_GIAN_DANG_NHAP_GIAY,
};

function layHeaderDauTien(request: NextRequest | undefined, name: string) {
  return request?.headers.get(name)?.split(",")[0]?.trim().toLowerCase() || null;
}

function nenDungCookieSecure(request?: NextRequest) {
  const envValue = process.env.AUTH_COOKIE_SECURE?.trim().toLowerCase();
  if (envValue === "true") return true;
  if (envValue === "false") return false;

  const forwardedProtocol = layHeaderDauTien(request, "x-forwarded-proto");
  const protocol = forwardedProtocol || request?.nextUrl.protocol.replace(":", "").toLowerCase();
  if (protocol) return protocol === "https";

  return process.env.NODE_ENV === "production";
}

export function taoCauHinhCookieXacThuc(request?: NextRequest) {
  return {
    ...cauHinhCookieXacThuc,
    secure: nenDungCookieSecure(request),
  };
}
