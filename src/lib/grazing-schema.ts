import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const GRAZING_SCHEMA_SQL = `
create table if not exists du_lieu.ke_hoach_chan_tha (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  ma_ke_hoach text not null,
  ten_ke_hoach text not null,
  kieu_ke_hoach text not null check (kieu_ke_hoach in ('perpetual', 'seasonal', 'off_season')),
  trang_thai text not null default 'active',
  ngay_bat_dau date,
  ngay_ket_thuc date,
  mua_vu text,
  nguoi_phu_trach text,
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trang_trai_id, ma_ke_hoach)
);

create table if not exists du_lieu.ke_hoach_chan_tha_khu_vuc (
  ke_hoach_id uuid not null references du_lieu.ke_hoach_chan_tha(id) on delete cascade,
  khu_vuc_id uuid not null references du_lieu.khu_vuc(id) on delete cascade,
  do_uu_tien integer not null default 5,
  danh_gia integer not null default 5,
  dien_tich_ha numeric,
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (ke_hoach_id, khu_vuc_id)
);

create table if not exists du_lieu.ke_hoach_chan_tha_nhom_vat_nuoi (
  ke_hoach_id uuid not null references du_lieu.ke_hoach_chan_tha(id) on delete cascade,
  nhom_vat_nuoi_id uuid not null references du_lieu.nhom_vat_nuoi(id) on delete cascade,
  so_luong_du_kien integer check (so_luong_du_kien is null or so_luong_du_kien >= 0),
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (ke_hoach_id, nhom_vat_nuoi_id)
);

create table if not exists du_lieu.su_kien_chan_tha (
  id uuid primary key default du_lieu.uuid_v4(),
  ke_hoach_id uuid not null references du_lieu.ke_hoach_chan_tha(id) on delete cascade,
  khu_vuc_id uuid references du_lieu.khu_vuc(id) on delete set null,
  nhom_vat_nuoi_id uuid references du_lieu.nhom_vat_nuoi(id) on delete set null,
  loai_su_kien text not null check (loai_su_kien in ('grazing', 'resting', 'burning', 'clipping', 'compacting', 'cultivating', 'cutting', 'deferred', 'feeding', 'fertilising', 'grooming', 'harrowing', 'harvesting', 'hoeing', 'levelling', 'maintenance', 'mowing', 'move', 'other', 'pest_management', 'plowing', 'repairing', 'reseeding', 'rolling', 'scarifying', 'seeding', 'smoothing', 'soil_testing', 'sowing', 'spell_grazing', 'spraying', 'subsoiling', 'tilling', 'thinning', 'top_cutting', 'weeding', 'watering', 'withholding')),
  tieu_de text not null,
  trang_thai text not null default 'active',
  ngay_bat_dau date,
  ngay_ket_thuc date,
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table du_lieu.ke_hoach_chan_tha
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table du_lieu.su_kien_chan_tha
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

alter table du_lieu.su_kien_chan_tha
  drop constraint if exists su_kien_chan_tha_loai_su_kien_check;

alter table du_lieu.su_kien_chan_tha
  add constraint su_kien_chan_tha_loai_su_kien_check
  check (loai_su_kien in ('grazing', 'resting', 'burning', 'clipping', 'compacting', 'cultivating', 'cutting', 'deferred', 'feeding', 'fertilising', 'grooming', 'harrowing', 'harvesting', 'hoeing', 'levelling', 'maintenance', 'mowing', 'move', 'other', 'pest_management', 'plowing', 'repairing', 'reseeding', 'rolling', 'scarifying', 'seeding', 'smoothing', 'soil_testing', 'sowing', 'spell_grazing', 'spraying', 'subsoiling', 'tilling', 'thinning', 'top_cutting', 'weeding', 'watering', 'withholding'));

create index if not exists idx_ke_hoach_chan_tha_trang_trai_id on du_lieu.ke_hoach_chan_tha(trang_trai_id);
create index if not exists idx_ke_hoach_chan_tha_trang_thai on du_lieu.ke_hoach_chan_tha(trang_thai);
create index if not exists idx_ke_hoach_chan_tha_ngay on du_lieu.ke_hoach_chan_tha(ngay_bat_dau, ngay_ket_thuc);
create index if not exists idx_chan_tha_khu_vuc_khu_vuc_id on du_lieu.ke_hoach_chan_tha_khu_vuc(khu_vuc_id);
create index if not exists idx_chan_tha_nhom_nhom_id on du_lieu.ke_hoach_chan_tha_nhom_vat_nuoi(nhom_vat_nuoi_id);
create index if not exists idx_su_kien_chan_tha_ke_hoach_id on du_lieu.su_kien_chan_tha(ke_hoach_id);
create index if not exists idx_su_kien_chan_tha_khu_vuc_id on du_lieu.su_kien_chan_tha(khu_vuc_id);
create index if not exists idx_su_kien_chan_tha_nhom_id on du_lieu.su_kien_chan_tha(nhom_vat_nuoi_id);
create index if not exists idx_su_kien_chan_tha_ngay on du_lieu.su_kien_chan_tha(ngay_bat_dau, ngay_ket_thuc);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureGrazingSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  ensurePromise ??= db.query(GRAZING_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
