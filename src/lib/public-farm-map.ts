import { withBasePath } from "@/lib/app-path";
import { db } from "@/lib/db";

export type PublicFarmDocument = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  number: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  fileUrl: string | null;
  note: string | null;
};

export type PublicFarmOverview = {
  address: string | null;
  areaHectare: number | null;
  specialFactors: string | null;
  otherActivity: string | null;
  annualRainfall: number | null;
  carryingCapacity: number | null;
  zoneCount: number;
  livestockCount: number;
  assetCount: number;
  sharedDocumentCount: number;
};

export type PublicFarmMapItem = {
  farmId: string;
  farmCode: string | null;
  farmName: string;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  createdAt: string | null;
  address: string | null;
  locationName: string | null;
  mapsLink: string | null;
  latitude: number;
  longitude: number;
  isMapShared: boolean;
  overview: PublicFarmOverview;
  sharedDocuments: PublicFarmDocument[];
};

const DEFAULT_COORD = { latitude: 10.762622, longitude: 106.660172 };
const ACTIVE_ZONE_SQL = "coalesce(lower(trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')";
const ACTIVE_LIVESTOCK_SQL = "coalesce(lower(trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')";
const ACTIVE_DOCUMENT_SQL = "coalesce(lower(trang_thai), 'active') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')";

function toNumberOrNull(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function toStringOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function toDateStringOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDocuments(value: unknown): PublicFarmDocument[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(isRecord)
    .map((document) => ({
      id: String(document.id ?? ""),
      code: String(document.code ?? ""),
      name: String(document.name ?? "Chứng từ"),
      type: toStringOrNull(document.type),
      number: toStringOrNull(document.number),
      issuedAt: toDateStringOrNull(document.issuedAt),
      expiresAt: toDateStringOrNull(document.expiresAt),
      fileUrl: document.fileUrl ? withBasePath(String(document.fileUrl)) : null,
      note: toStringOrNull(document.note),
    }))
    .filter((document) => document.id && document.name);
}

export async function getPublicFarmMapItems(): Promise<PublicFarmMapItem[]> {
  const rs = await db.query(
    `select t.id as farm_id,
            t.ma_trang_trai as farm_code,
            t.ten_trang_trai as farm_name,
            t.dia_chi as address,
            t.created_at,
            coalesce(u.ho_ten, u.email, 'Nông dân') as owner_name,
            u.anh_dai_dien_url as owner_avatar_url,
            v.ten_dia_diem as location_name,
            v.maps_link,
            coalesce(v.vi_do, t.vi_do, 10.762622) as latitude,
            coalesce(v.kinh_do, t.kinh_do, 106.660172) as longitude,
            coalesce(t.is_map_shared, false) as is_map_shared,
            s.dien_tich_ha as area_hectare,
            s.yeu_to_dac_biet as special_factors,
            s.hoat_dong_khac as other_activity,
            s.luong_mua_hang_nam as annual_rainfall,
            s.suc_tai_chan_tha as carrying_capacity,
            coalesce(z.zone_count, 0) as zone_count,
            coalesce(a.asset_count, 0) as asset_count,
            coalesce(l.livestock_count, 0) as livestock_count,
            coalesce(d.shared_document_count, 0) as shared_document_count,
            coalesce(d.shared_documents, '[]'::jsonb) as shared_documents
     from du_lieu.trang_trai t
     left join du_lieu.nguoi_dung u on u.id = t.chu_so_huu_id
     left join lateral (
       select *
       from du_lieu.vi_tri_trang_trai
       where trang_trai_id = t.id
       order by created_at desc nulls last, id desc
       limit 1
     ) v on true
     left join du_lieu.cai_dat_trang_trai s on s.trang_trai_id = t.id
     left join lateral (
       select count(*)::int as zone_count
       from du_lieu.khu_vuc
       where trang_trai_id = t.id
         and ${ACTIVE_ZONE_SQL}
     ) z on true
     left join lateral (
       select count(*)::int as asset_count
       from du_lieu.tai_san_rao
       where trang_trai_id = t.id
     ) a on true
     left join lateral (
       select count(*)::int as livestock_count
       from du_lieu.vat_nuoi
       where trang_trai_id = t.id
         and ${ACTIVE_LIVESTOCK_SQL}
     ) l on true
     left join lateral (
       select count(*)::int as shared_document_count,
              jsonb_agg(
                jsonb_build_object(
                  'id', c.id::text,
                  'code', c.ma_chung_tu,
                  'name', c.ten_chung_tu,
                  'type', c.loai_chung_tu,
                  'number', c.so_chung_tu,
                  'issuedAt', c.ngay_ban_hanh,
                  'expiresAt', c.ngay_het_han,
                  'fileUrl', c.tep_dinh_kem_url,
                  'note', c.ghi_chu
                )
                order by c.created_at desc nulls last, c.ten_chung_tu asc
              ) as shared_documents
       from du_lieu.chung_tu_trang_trai c
       where c.trang_trai_id = t.id
         and c.metadata_json->>'is_shared' = 'true'
         and ${ACTIVE_DOCUMENT_SQL}
     ) d on true
     where coalesce(t.is_map_shared, false) = true
       and (t.vi_do is not null
        or t.kinh_do is not null
        or v.vi_do is not null
        or v.kinh_do is not null)
     order by t.created_at desc nulls last, t.id desc`
  );

  return rs.rows
    .map((row) => {
      const address = toStringOrNull(row.address);
      const sharedDocuments = normalizeDocuments(row.shared_documents);
      const sharedDocumentCount = Number(row.shared_document_count ?? sharedDocuments.length);

      return {
        farmId: String(row.farm_id),
        farmCode: toStringOrNull(row.farm_code),
        farmName: String(row.farm_name ?? "Trang trại"),
        ownerName: toStringOrNull(row.owner_name),
        ownerAvatarUrl: toStringOrNull(row.owner_avatar_url),
        createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
        address,
        locationName: toStringOrNull(row.location_name),
        mapsLink: toStringOrNull(row.maps_link),
        latitude: Number.isFinite(Number(row.latitude)) ? Number(row.latitude) : DEFAULT_COORD.latitude,
        longitude: Number.isFinite(Number(row.longitude)) ? Number(row.longitude) : DEFAULT_COORD.longitude,
        isMapShared: Boolean(row.is_map_shared),
        overview: {
          address,
          areaHectare: toNumberOrNull(row.area_hectare),
          specialFactors: toStringOrNull(row.special_factors),
          otherActivity: toStringOrNull(row.other_activity),
          annualRainfall: toNumberOrNull(row.annual_rainfall),
          carryingCapacity: toNumberOrNull(row.carrying_capacity),
          zoneCount: Number(row.zone_count ?? 0),
          livestockCount: Number(row.livestock_count ?? 0),
          assetCount: Number(row.asset_count ?? 0),
          sharedDocumentCount,
        },
        sharedDocuments,
      };
    })
    .filter((item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude));
}
