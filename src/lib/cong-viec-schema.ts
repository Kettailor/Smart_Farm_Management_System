import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

let schemaReady: Promise<void> | null = null;

export async function ensureWorkSchema() {
  if (!shouldRunRuntimeSchemaSync()) return;
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.query(`
        create table if not exists du_lieu.cong_viec (
          id uuid primary key,
          trang_trai_id uuid not null references du_lieu.trang_trai(id) on delete cascade,
          ma_cong_viec text not null,
          ten_cong_viec text not null,
          loai_cong_viec text not null check (loai_cong_viec in ('tong_quat', 'bao_tri', 'canh_tac', 'chan_nuoi', 'kiem_tra')),
          trang_thai text not null check (trang_thai in ('dang_mo', 'sap_toi', 'qua_han', 'tam_dung', 'hoan_thanh', 'da_huy')),
          ngay_bat_dau date,
          ngay_het_han date,
          nguoi_phu_trach text,
          mo_ta text,
          metadata_json jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          unique (trang_trai_id, ma_cong_viec)
        );

        create table if not exists du_lieu.cong_viec_hang_muc (
          id uuid primary key,
          cong_viec_id uuid not null references du_lieu.cong_viec(id) on delete cascade,
          tieu_de text not null,
          trang_thai text not null check (trang_thai in ('chua_lam', 'dang_lam', 'hoan_thanh', 'da_huy')),
          muc_uu_tien text not null default 'trung_binh' check (muc_uu_tien in ('thap', 'trung_binh', 'cao', 'khan_cap')),
          ngay_het_han date,
          nguoi_phu_trach text,
          nguoi_bao_cao text,
          ghi_chu text,
          metadata_json jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );

        alter table du_lieu.cong_viec_hang_muc
          add column if not exists muc_uu_tien text not null default 'trung_binh',
          add column if not exists nguoi_phu_trach text,
          add column if not exists nguoi_bao_cao text,
          add column if not exists metadata_json jsonb not null default '{}'::jsonb;

        alter table du_lieu.cong_viec_hang_muc
          drop constraint if exists cong_viec_hang_muc_muc_uu_tien_check;

        alter table du_lieu.cong_viec_hang_muc
          add constraint cong_viec_hang_muc_muc_uu_tien_check
          check (muc_uu_tien in ('thap', 'trung_binh', 'cao', 'khan_cap'));

        create index if not exists idx_cong_viec_trang_trai_id on du_lieu.cong_viec(trang_trai_id);
        create index if not exists idx_cong_viec_trang_thai on du_lieu.cong_viec(trang_thai);
        create index if not exists idx_cong_viec_ngay on du_lieu.cong_viec(ngay_bat_dau, ngay_het_han);
        create index if not exists idx_cong_viec_hang_muc_cong_viec_id on du_lieu.cong_viec_hang_muc(cong_viec_id);
      `);
    })();
  }

  return schemaReady;
}
