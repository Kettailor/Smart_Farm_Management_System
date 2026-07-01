import { NextRequest, NextResponse } from "next/server";
import { withBasePath, withoutBasePath } from "@/lib/app-path";
import {
  docPayloadTokenXacThuc,
  layBiMatXacThuc,
  payloadTokenConHan,
  TEN_COOKIE_XAC_THUC,
} from "@/lib/auth-token";

const TRANG_CHI_CHO_KHACH = new Set(["/login", "/register"]);
const TRANG_CAN_DANG_NHAP = ["/dashboard", "/register/farm"];

function laCungPath(pathname: string, path: string) {
  return pathname === path || pathname === `${path}/`;
}

function canDangNhap(pathname: string) {
  return TRANG_CAN_DANG_NHAP.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function taoBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function soSanhChuKy(a: string, b: string) {
  if (a.length !== b.length) return false;

  let diff = 0;
  for (let index = 0; index < a.length; index += 1) {
    diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return diff === 0;
}

async function taoChuKy(payloadBase64: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(layBiMatXacThuc()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadBase64));
  return taoBase64Url(new Uint8Array(signature));
}

async function layOwnerIdTuToken(token?: string | null) {
  if (!token) return null;

  const [payloadBase64, signature, extra] = token.split(".");
  if (!payloadBase64 || !signature || extra !== undefined) return null;

  const signatureHopLe = await taoChuKy(payloadBase64);
  if (!soSanhChuKy(signature, signatureHopLe)) return null;

  const payload = docPayloadTokenXacThuc(payloadBase64);
  if (!payloadTokenConHan(payload)) return null;
  return payload?.owner_id ?? null;
}

function layHeaderDauTien(request: NextRequest, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function taoOriginTuRequest(request: NextRequest) {
  const host = layHeaderDauTien(request, "x-forwarded-host") || layHeaderDauTien(request, "host") || request.nextUrl.host;
  const protocol = layHeaderDauTien(request, "x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

function taoUrlRedirect(request: NextRequest, pathname: string) {
  return new URL(withBasePath(pathname), taoOriginTuRequest(request));
}

function taoLoginRedirect(request: NextRequest) {
  const url = taoUrlRedirect(request, "/login");
  const nextPath = `${withoutBasePath(request.nextUrl.pathname)}${request.nextUrl.search}`;
  url.searchParams.set("next", nextPath);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const pathname = withoutBasePath(request.nextUrl.pathname);
  const ownerId = await layOwnerIdTuToken(request.cookies.get(TEN_COOKIE_XAC_THUC)?.value);
  const daDangNhap = Boolean(ownerId);

  if (Array.from(TRANG_CHI_CHO_KHACH).some((path) => laCungPath(pathname, path)) && daDangNhap) {
    return NextResponse.redirect(taoUrlRedirect(request, "/dashboard"));
  }

  if (canDangNhap(pathname) && !daDangNhap) {
    return taoLoginRedirect(request);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register", "/register/farm/:path*"],
};
