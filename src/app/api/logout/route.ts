import { NextRequest, NextResponse } from "next/server";
import { TEN_COOKIE_XAC_THUC, taoCauHinhCookieXacThuc } from "@/lib/auth";
import { withBasePath } from "@/lib/app-path";

export const dynamic = "force-dynamic";

function xoaCookieDangNhap(request: NextRequest, response: NextResponse) {
  const cookieConfig = taoCauHinhCookieXacThuc(request);
  response.cookies.set(TEN_COOKIE_XAC_THUC, "", { ...cookieConfig, maxAge: 0 });
  response.cookies.set("ownerId", "", { ...cookieConfig, maxAge: 0 });
  return response;
}

function layHeaderDauTien(request: NextRequest, name: string) {
  return request.headers.get(name)?.split(",")[0]?.trim() || null;
}

function taoOriginTuRequest(request: NextRequest) {
  const host = layHeaderDauTien(request, "x-forwarded-host") || layHeaderDauTien(request, "host") || request.nextUrl.host;
  const protocol = layHeaderDauTien(request, "x-forwarded-proto") || request.nextUrl.protocol.replace(":", "") || "http";
  return `${protocol}://${host}`;
}

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ message: "Dang xuat thanh cong." });
  return xoaCookieDangNhap(request, response);
}

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") || "/login";
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  const url = new URL(withBasePath(safeNext), taoOriginTuRequest(request));
  return xoaCookieDangNhap(request, NextResponse.redirect(url));
}
