import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { layOwnerIdTuServerCookie } from "@/lib/auth";
import { withBasePath } from "@/lib/app-path";
import { db } from "@/lib/db";
import { requireFarmAccess } from "@/lib/farm-access";
import { loadSettingsProfile } from "@/lib/settings-overview";
import { ensureSettingsSchema } from "@/lib/settings-schema";

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function cleanText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function makeDocumentCode(type: string) {
  const prefix = type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toUpperCase()
    .slice(0, 18) || "CHUNG-TU";
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

async function saveDocumentImage(file: File, farmId: string) {
  if (!file.type.startsWith("image/") || !IMAGE_EXTENSIONS[file.type]) {
    throw new Error("Chỉ hỗ trợ tải lên chứng từ dạng hình ảnh JPG, PNG, WEBP hoặc GIF.");
  }
  if (file.size <= 0) throw new Error("Tệp ảnh không hợp lệ.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("Ảnh chứng từ không được vượt quá 8MB.");

  const extension = IMAGE_EXTENSIONS[file.type];
  const fileName = `${farmId}-${Date.now()}-${randomBytes(8).toString("hex")}.${extension}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", "farm-documents");
  await mkdir(uploadDir, { recursive: true });
  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(uploadDir, fileName), bytes);
  return withBasePath(`/uploads/farm-documents/${fileName}`);
}

export async function POST(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });

    await ensureSettingsSchema();

    const formData = await request.formData();
    const farmId = cleanText(formData.get("farm_id"));
    const name = cleanText(formData.get("name"));
    const type = cleanText(formData.get("type")) || "khac";
    const number = cleanText(formData.get("number"));
    const issuedAt = cleanOptionalDate(cleanText(formData.get("issued_at")));
    const expiresAt = cleanOptionalDate(cleanText(formData.get("expires_at")));
    const note = cleanText(formData.get("note"));
    const isShared = cleanText(formData.get("is_shared")) === "true";
    const file = formData.get("file");

    if (!farmId) return NextResponse.json({ message: "Không tìm thấy trang trại để lưu chứng từ." }, { status: 400 });
    if (!name) return NextResponse.json({ message: "Vui lòng nhập tên chứng từ." }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ message: "Vui lòng chọn ảnh chứng từ để tải lên." }, { status: 400 });

    const access = await requireFarmAccess(ownerId, "documents", farmId);
    if (!access) {
      return NextResponse.json({ message: "Bạn không có quyền quản lý chứng từ của trang trại này." }, { status: 403 });
    }

    const fileUrl = await saveDocumentImage(file, farmId);
    const code = makeDocumentCode(type);
    const metadata = {
      is_shared: isShared,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      source: "settings",
    };

    await db.query(
      `insert into du_lieu.chung_tu_trang_trai
         (id, trang_trai_id, ma_chung_tu, ten_chung_tu, loai_chung_tu, so_chung_tu, ngay_ban_hanh, ngay_het_han, trang_thai, tep_dinh_kem_url, ghi_chu, metadata_json)
       values ($1, $2, $3, $4, $5, nullif($6, ''), $7::date, $8::date, 'active', $9, nullif($10, ''), $11::jsonb)`,
      [randomUUID(), farmId, code, name, type, number, issuedAt, expiresAt, fileUrl, note, JSON.stringify(metadata)]
    );

    const profile = await loadSettingsProfile(ownerId);
    return NextResponse.json({ message: "Đã tải lên chứng từ.", profile });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể tải lên chứng từ.", error: String(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const ownerId = layOwnerIdTuServerCookie();
    if (!ownerId) return NextResponse.json({ message: "Chưa đăng nhập." }, { status: 401 });

    await ensureSettingsSchema();

    const body = (await request.json()) as { farm_id?: string; document_id?: string; is_shared?: boolean };
    const farmId = typeof body.farm_id === "string" ? body.farm_id.trim() : "";
    const documentId = typeof body.document_id === "string" ? body.document_id.trim() : "";
    const isShared = body.is_shared === true;

    if (!farmId || !documentId) {
      return NextResponse.json({ message: "Không tìm thấy chứng từ để cập nhật chia sẻ." }, { status: 400 });
    }

    const access = await requireFarmAccess(ownerId, "documents", farmId);
    if (!access) {
      return NextResponse.json({ message: "Bạn không có quyền chia sẻ chứng từ của trang trại này." }, { status: 403 });
    }

    const result = await db.query(
      `update du_lieu.chung_tu_trang_trai
       set metadata_json = coalesce(metadata_json, '{}'::jsonb) || $3::jsonb,
           updated_at = now()
       where id::text = $1 and trang_trai_id = $2
       returning id`,
      [documentId, farmId, JSON.stringify({ is_shared: isShared })]
    );
    if (result.rowCount === 0) {
      return NextResponse.json({ message: "Không tìm thấy chứng từ để cập nhật." }, { status: 404 });
    }

    const profile = await loadSettingsProfile(ownerId);
    return NextResponse.json({ message: isShared ? "Đã bật chia sẻ chứng từ." : "Đã tắt chia sẻ chứng từ.", profile });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Không thể cập nhật chia sẻ chứng từ.", error: String(error) },
      { status: 500 }
    );
  }
}
