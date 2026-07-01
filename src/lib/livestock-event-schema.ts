import { db } from "@/lib/db";
import { ensureLivestockSchema } from "@/lib/livestock-schema";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const LIVESTOCK_EVENT_SCHEMA_SQL = `
create table if not exists du_lieu.su_kien_vat_nuoi (
  id uuid primary key default du_lieu.uuid_v4(),
  trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
  nhom_vat_nuoi_id uuid references du_lieu.nhom_vat_nuoi(id) on delete set null,
  khu_vuc_nguon_id uuid references du_lieu.khu_vuc(id) on delete set null,
  khu_vuc_dich_id uuid references du_lieu.khu_vuc(id) on delete set null,
  ma_su_kien text not null,
  loai_su_kien text not null check (loai_su_kien in ('adjustment', 'reproduction', 'health', 'move', 'weight', 'grouping')),
  tieu_de text not null,
  ngay_su_kien date not null default current_date,
  pham_vi_su_kien text not null default 'ca_the' check (pham_vi_su_kien in ('nhom', 'ca_the')),
  so_luong_vat_nuoi integer not null default 0 check (so_luong_vat_nuoi >= 0),
  gia_tri_so numeric,
  don_vi text,
  nguoi_thuc_hien text,
  ngay_nhac_lai date,
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trang_trai_id, ma_su_kien)
);

update du_lieu.su_kien_vat_nuoi
   set loai_su_kien = 'health',
       metadata_json = coalesce(metadata_json, '{}'::jsonb) || jsonb_build_object('migratedFromEventType', 'treatment'),
       updated_at = now()
 where loai_su_kien = 'treatment';

alter table du_lieu.su_kien_vat_nuoi
  drop constraint if exists su_kien_vat_nuoi_loai_su_kien_check;

alter table du_lieu.su_kien_vat_nuoi
  add constraint su_kien_vat_nuoi_loai_su_kien_check
  check (loai_su_kien in ('adjustment', 'reproduction', 'health', 'move', 'weight', 'grouping'));

create table if not exists du_lieu.su_kien_vat_nuoi_ca_the (
  su_kien_id uuid not null references du_lieu.su_kien_vat_nuoi(id) on delete cascade,
  vat_nuoi_id uuid not null references du_lieu.vat_nuoi(id) on delete cascade,
  gia_tri_so numeric,
  don_vi text,
  ghi_chu text,
  metadata_json jsonb not null default '{}'::jsonb,
  primary key (su_kien_id, vat_nuoi_id)
);

alter table du_lieu.su_kien_vat_nuoi_ca_the
  add column if not exists gia_tri_so numeric,
  add column if not exists don_vi text,
  add column if not exists ghi_chu text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create index if not exists idx_su_kien_vat_nuoi_trang_trai_id on du_lieu.su_kien_vat_nuoi(trang_trai_id);
create index if not exists idx_su_kien_vat_nuoi_nhom_id on du_lieu.su_kien_vat_nuoi(nhom_vat_nuoi_id);
create index if not exists idx_su_kien_vat_nuoi_loai on du_lieu.su_kien_vat_nuoi(loai_su_kien);
create index if not exists idx_su_kien_vat_nuoi_ngay on du_lieu.su_kien_vat_nuoi(ngay_su_kien);
create index if not exists idx_su_kien_ca_the_vat_nuoi_id on du_lieu.su_kien_vat_nuoi_ca_the(vat_nuoi_id);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureLivestockEventSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  await ensureLivestockSchema();
  ensurePromise ??= db.query(LIVESTOCK_EVENT_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
