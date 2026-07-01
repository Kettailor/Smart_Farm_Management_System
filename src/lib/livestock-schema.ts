import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const LIVESTOCK_GROUP_SCHEMA_SQL = `
create table if not exists du_lieu.nhom_vat_nuoi (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null,
  ma_nhom text not null,
  ten_nhom text not null,
  loai_vat_nuoi text not null,
  mo_ta text,
  cach_tao text,
  giong text,
  so_luong integer not null default 0 check (so_luong >= 0),
  gioi_tinh text,
  giai_doan_sinh_truong text,
  trang_thai_suc_khoe text,
  muc_dich_san_xuat text,
  ghi_chu_dan text,
  nguon_goc text,
  gia_tri_mua numeric,
  tai_khoan_chi_phi text,
  ngay_sinh date,
  kieu_thu_thai text,
  trong_luong_so_sinh_kg numeric,
  ghi_chu_sinh text,
  van_de_suc_khoe text,
  ma_me text,
  ma_bo text,
  mau_long text,
  mau_mat text,
  kieu_tai text,
  kieu_sung text,
  tinh_trang_mieng text,
  diem_the_trang numeric,
  ghi_chu_dac_diem text,
  nhan_dien_chinh text,
  trang_thai_sinh_san text,
  kha_nang_sinh_san text,
  tang_trong_binh_quan_ngay numeric,
  nang_luong_megajoule_ngay numeric,
  trong_luong_muc_tieu_kg numeric,
  ngay_can_muc_tieu date,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trang_trai_id, ma_nhom)
);

alter table du_lieu.nhom_vat_nuoi
  add column if not exists khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null;

create table if not exists du_lieu.vat_nuoi (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null,
  nhom_vat_nuoi_id uuid references du_lieu.nhom_vat_nuoi(id) on delete set null,
  ma_vat_nuoi text,
  ma_qr text,
  the_nhan_dien text,
  loai_vat_nuoi text,
  giong text,
  gioi_tinh text,
  giai_doan_sinh_truong text,
  ngay_sinh date,
  nguon_goc text,
  ma_me text,
  ma_bo text,
  mau_long text,
  trang_thai_sinh_san text,
  trang_thai text,
  mo_ta text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table du_lieu.vat_nuoi
  add column if not exists khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null;

alter table du_lieu.vat_nuoi
  add column if not exists nhom_vat_nuoi_id uuid references du_lieu.nhom_vat_nuoi(id) on delete set null;

alter table du_lieu.vat_nuoi
  add column if not exists ma_qr text;

alter table du_lieu.vat_nuoi
  add column if not exists loai_vat_nuoi text,
  add column if not exists giong text,
  add column if not exists gioi_tinh text,
  add column if not exists giai_doan_sinh_truong text,
  add column if not exists ngay_sinh date,
  add column if not exists nguon_goc text,
  add column if not exists ma_me text,
  add column if not exists ma_bo text,
  add column if not exists mau_long text,
  add column if not exists trang_thai_sinh_san text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

update du_lieu.vat_nuoi v
   set loai_vat_nuoi = coalesce(v.loai_vat_nuoi, n.loai_vat_nuoi),
       giong = coalesce(v.giong, n.giong),
       gioi_tinh = coalesce(v.gioi_tinh, n.gioi_tinh),
       giai_doan_sinh_truong = coalesce(v.giai_doan_sinh_truong, n.giai_doan_sinh_truong),
       ngay_sinh = coalesce(v.ngay_sinh, n.ngay_sinh),
       nguon_goc = coalesce(v.nguon_goc, n.nguon_goc),
       ma_me = coalesce(v.ma_me, n.ma_me),
       ma_bo = coalesce(v.ma_bo, n.ma_bo),
       mau_long = coalesce(v.mau_long, n.mau_long),
       trang_thai_sinh_san = coalesce(v.trang_thai_sinh_san, n.trang_thai_sinh_san),
       metadata_json = coalesce(v.metadata_json, '{}'::jsonb) || jsonb_build_object(
         'groupSnapshot', jsonb_build_object(
           'groupId', n.id::text,
           'groupCode', n.ma_nhom,
           'groupName', n.ten_nhom,
           'species', n.loai_vat_nuoi,
           'breed', n.giong,
           'createdFrom', n.cach_tao,
           'lifeStage', n.giai_doan_sinh_truong,
           'purpose', n.muc_dich_san_xuat,
           'source', n.nguon_goc
         )
       )
  from du_lieu.nhom_vat_nuoi n
 where v.nhom_vat_nuoi_id = n.id
   and (
     v.loai_vat_nuoi is null
     or v.giong is null
     or v.gioi_tinh is null
     or v.giai_doan_sinh_truong is null
     or not (coalesce(v.metadata_json, '{}'::jsonb) ? 'groupSnapshot')
   );

create index if not exists idx_nhom_vat_nuoi_trang_trai_id on du_lieu.nhom_vat_nuoi(trang_trai_id);
create index if not exists idx_nhom_vat_nuoi_khu_vuc_id on du_lieu.nhom_vat_nuoi(khu_vuc_id);
create index if not exists idx_vat_nuoi_khu_vuc_id on du_lieu.vat_nuoi(khu_vuc_id);
create index if not exists idx_vat_nuoi_nhom_vat_nuoi_id on du_lieu.vat_nuoi(nhom_vat_nuoi_id);
create index if not exists idx_vat_nuoi_loai_vat_nuoi on du_lieu.vat_nuoi(loai_vat_nuoi);
create unique index if not exists idx_vat_nuoi_ma_qr_unique on du_lieu.vat_nuoi(ma_qr) where ma_qr is not null;
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureLivestockSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  ensurePromise ??= db.query(LIVESTOCK_GROUP_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
