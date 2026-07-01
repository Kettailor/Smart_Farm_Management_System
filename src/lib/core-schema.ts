import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const CORE_SCHEMA_SQL = `
create table if not exists du_lieu.nguoi_dung (
  id uuid primary key,
  ho_ten text not null,
  email text not null unique,
  mat_khau_hash text not null,
  anh_dai_dien_url text,
  so_dien_thoai text,
  ngon_ngu text,
  trang_thai text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table du_lieu.nguoi_dung
  add column if not exists anh_dai_dien_url text,
  add column if not exists so_dien_thoai text,
  add column if not exists ngon_ngu text,
  add column if not exists trang_thai text not null default 'active';

create table if not exists du_lieu.trang_trai (
  id uuid primary key,
  chu_so_huu_id uuid not null references du_lieu.nguoi_dung(id) on delete cascade,
  ma_trang_trai text unique,
  ten_trang_trai text not null,
  dia_chi text,
  kinh_do numeric,
  vi_do numeric,
  is_map_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table du_lieu.trang_trai
  add column if not exists is_map_shared boolean not null default false;

create table if not exists du_lieu.vi_tri_trang_trai (
  id uuid primary key,
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  ten_dia_diem text,
  maps_link text,
  kinh_do numeric,
  vi_do numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists du_lieu.cai_dat_trang_trai (
  trang_trai_id uuid primary key references du_lieu.trang_trai(id) on delete cascade,
  dien_tich_ha numeric,
  yeu_to_dac_biet text,
  hoat_dong_khac text,
  luong_mua_hang_nam numeric,
  suc_tai_chan_tha numeric,
  mua_xuan_bat_dau text,
  don_vi_tieu_chuan jsonb not null default '{
    "animal_load": "DSE",
    "area": "Hectare",
    "length": "Metric",
    "mass": "Metric",
    "spring": "1-Sep",
    "temperature": "Celsius",
    "preferred_units": "Metric",
    "volume": "Metric"
  }'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureCoreSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  ensurePromise ??= db.query(CORE_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
