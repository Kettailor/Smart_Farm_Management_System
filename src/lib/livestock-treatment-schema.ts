import { db } from "@/lib/db";
import { ensureLivestockSchema } from "@/lib/livestock-schema";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";
import { ensureWarehouseSchema } from "@/lib/warehouse-schema";

export const LIVESTOCK_TREATMENT_SCHEMA_SQL = `
create table if not exists du_lieu.dieu_tri_vat_nuoi (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  nhom_vat_nuoi_id uuid references du_lieu.nhom_vat_nuoi(id) on delete set null,
  kho_vat_tu_id uuid not null references du_lieu.kho_vat_tu(id) on delete restrict,
  ma_dieu_tri text not null,
  loai_dieu_tri text not null check (loai_dieu_tri in ('footrot', 'vaccination', 'supplement', 'dehorn', 'parasite', 'dry_off', 'custom')),
  ten_dieu_tri text not null,
  ngay_dieu_tri date not null default current_date,
  pham_vi_dieu_tri text not null default 'nhom' check (pham_vi_dieu_tri in ('nhom', 'ca_the', 'nhap_tay')),
  so_luong_vat_nuoi integer not null default 0 check (so_luong_vat_nuoi >= 0),
  lieu_luong_moi_con numeric not null default 0 check (lieu_luong_moi_con >= 0),
  don_vi_lieu_luong text not null default 'don_vi/con',
  tong_luong_dung numeric not null default 0 check (tong_luong_dung >= 0),
  don_vi_ton_kho text not null default 'don_vi',
  lo_san_xuat text,
  phuong_phap text,
  nguoi_thuc_hien text,
  thoi_gian_ngung_su_dung_ngay integer check (thoi_gian_ngung_su_dung_ngay is null or thoi_gian_ngung_su_dung_ngay >= 0),
  thoi_gian_esi_ngay integer check (thoi_gian_esi_ngay is null or thoi_gian_esi_ngay >= 0),
  ngay_ket_thuc_cach_ly date,
  ngay_nhac_lai date,
  trang_thai text not null default 'hoan_tat',
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trang_trai_id, ma_dieu_tri)
);

create table if not exists du_lieu.dieu_tri_vat_nuoi_ca_the (
  dieu_tri_id uuid not null references du_lieu.dieu_tri_vat_nuoi(id) on delete cascade,
  vat_nuoi_id uuid not null references du_lieu.vat_nuoi(id) on delete cascade,
  primary key (dieu_tri_id, vat_nuoi_id)
);

create table if not exists du_lieu.kho_vat_tu_giao_dich (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  kho_vat_tu_id uuid not null references du_lieu.kho_vat_tu(id) on delete cascade,
  loai_giao_dich text not null,
  nguon_nghiep_vu text,
  nguon_ban_ghi_id uuid,
  so_luong numeric not null check (so_luong >= 0),
  so_luong_truoc numeric,
  so_luong_sau numeric,
  don_vi text,
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_dieu_tri_vat_nuoi_trang_trai_id on du_lieu.dieu_tri_vat_nuoi(trang_trai_id);
create index if not exists idx_dieu_tri_vat_nuoi_nhom_id on du_lieu.dieu_tri_vat_nuoi(nhom_vat_nuoi_id);
create index if not exists idx_dieu_tri_vat_nuoi_kho_id on du_lieu.dieu_tri_vat_nuoi(kho_vat_tu_id);
create index if not exists idx_dieu_tri_vat_nuoi_ngay on du_lieu.dieu_tri_vat_nuoi(ngay_dieu_tri);
create index if not exists idx_dieu_tri_ca_the_vat_nuoi_id on du_lieu.dieu_tri_vat_nuoi_ca_the(vat_nuoi_id);
create index if not exists idx_kho_vat_tu_giao_dich_kho_id on du_lieu.kho_vat_tu_giao_dich(kho_vat_tu_id);
create index if not exists idx_kho_vat_tu_giao_dich_nguon on du_lieu.kho_vat_tu_giao_dich(nguon_nghiep_vu, nguon_ban_ghi_id);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureLivestockTreatmentSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  await ensureWarehouseSchema();
  await ensureLivestockSchema();
  ensurePromise ??= db.query(LIVESTOCK_TREATMENT_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
