import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const WAREHOUSE_SCHEMA_SQL = `
create table if not exists du_lieu.kho_vat_tu (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null,
  ma_vat_tu text not null,
  ten_vat_tu text not null,
  loai_kho text not null check (loai_kho in ('cong_cu', 'hoa_chat', 'thuc_an', 'thanh_pham_vat_nuoi')),
  nhom_hang text,
  so_luong numeric not null default 0 check (so_luong >= 0),
  don_vi text not null default 'cai',
  nguong_toi_thieu numeric not null default 0 check (nguong_toi_thieu >= 0),
  vi_tri_luu_tru text,
  trang_thai text not null default 'binh_thuong',
  ngay_nhap date,
  han_su_dung date,
  nha_cung_cap text,
  nguoi_phu_trach text,
  gia_tri_uoc_tinh numeric,
  ghi_chu text,
  ten_rut_gon text,
  phan_loai_san_pham text,
  whp_ngay integer check (whp_ngay is null or whp_ngay >= 0),
  esi_ngay integer check (esi_ngay is null or esi_ngay >= 0),
  mo_ta_san_pham text,
  so_don_vi numeric check (so_don_vi is null or so_don_vi >= 0),
  dung_tich_moi_don_vi numeric check (dung_tich_moi_don_vi is null or dung_tich_moi_don_vi >= 0),
  don_vi_dung_tich text,
  tong_dung_tich numeric check (tong_dung_tich is null or tong_dung_tich >= 0),
  don_gia numeric check (don_gia is null or don_gia >= 0),
  tong_chi_phi numeric check (tong_chi_phi is null or tong_chi_phi >= 0),
  so_lo text,
  ngay_mua date,
  ngay_san_xuat date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trang_trai_id, ma_vat_tu)
);

alter table du_lieu.kho_vat_tu
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table du_lieu.kho_vat_tu
  add column if not exists khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null;

alter table du_lieu.kho_vat_tu
  add column if not exists ten_rut_gon text,
  add column if not exists phan_loai_san_pham text,
  add column if not exists whp_ngay integer,
  add column if not exists esi_ngay integer,
  add column if not exists mo_ta_san_pham text,
  add column if not exists so_don_vi numeric,
  add column if not exists dung_tich_moi_don_vi numeric,
  add column if not exists don_vi_dung_tich text,
  add column if not exists tong_dung_tich numeric,
  add column if not exists don_gia numeric,
  add column if not exists tong_chi_phi numeric,
  add column if not exists so_lo text,
  add column if not exists ngay_mua date,
  add column if not exists ngay_san_xuat date;

create index if not exists idx_kho_vat_tu_trang_trai_id on du_lieu.kho_vat_tu(trang_trai_id);
create index if not exists idx_kho_vat_tu_khu_vuc_id on du_lieu.kho_vat_tu(khu_vuc_id);
create index if not exists idx_kho_vat_tu_loai_kho on du_lieu.kho_vat_tu(loai_kho);
create index if not exists idx_kho_vat_tu_han_su_dung on du_lieu.kho_vat_tu(han_su_dung);

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

create index if not exists idx_kho_vat_tu_giao_dich_kho_id on du_lieu.kho_vat_tu_giao_dich(kho_vat_tu_id);
create index if not exists idx_kho_vat_tu_giao_dich_nguon on du_lieu.kho_vat_tu_giao_dich(nguon_nghiep_vu, nguon_ban_ghi_id);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureWarehouseSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  ensurePromise ??= db.query(WAREHOUSE_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
