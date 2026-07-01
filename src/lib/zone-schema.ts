import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export const ZONE_SCHEMA_SQL = `
insert into du_lieu.danh_muc_loai_khu_vuc (ten, mo_ta)
values
  ('parking', 'Bai do xe'),
  ('storage', 'Kho luu tru'),
  ('cropping', 'Trong trot'),
  ('livestock', 'Chan nuoi'),
  ('grazing', 'Dong co chan tha'),
  ('water', 'Nguon nuoc')
on conflict (ten) do update set mo_ta = excluded.mo_ta;

alter table du_lieu.khu_vuc
  add column if not exists loai_khu_vuc text;

alter table du_lieu.khu_vuc
  add column if not exists thong_tin_loai jsonb not null default '{}'::jsonb;

alter table du_lieu.khu_vuc
  add column if not exists nhom_luu_tru_kho text[] not null default '{}'::text[];

alter table du_lieu.khu_vuc
  add column if not exists tam_vi_do numeric;

alter table du_lieu.khu_vuc
  add column if not exists tam_kinh_do numeric;

alter table du_lieu.khu_vuc_kho_luong_thuc
  add column if not exists nhom_luu_tru text[] not null default '{}'::text[];

alter table du_lieu.khu_vuc_kho_luong_thuc
  add column if not exists thong_tin_kho jsonb not null default '{}'::jsonb;

create index if not exists idx_khu_vuc_loai_khu_vuc on du_lieu.khu_vuc(loai_khu_vuc);
create index if not exists idx_khu_vuc_nhom_luu_tru_kho on du_lieu.khu_vuc using gin(nhom_luu_tru_kho);
`;

let ensurePromise: Promise<void> | null = null;

export async function ensureZoneSchema() {
  if (!process.env.DATABASE_URL || !shouldRunRuntimeSchemaSync()) return;
  ensurePromise ??= db.query(ZONE_SCHEMA_SQL).then(() => undefined);
  return ensurePromise;
}
