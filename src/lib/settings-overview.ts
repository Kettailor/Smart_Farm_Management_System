import { withBasePath } from "@/lib/app-path";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getAccessibleFarm, getAccessibleFarmCount, type FarmAccess } from "@/lib/farm-access";
import { expireFarmInvitations } from "@/lib/farm-invitations";
import { ensureFarmSettingsDefaults, ensureSettingsSchema } from "@/lib/settings-schema";
import type { PoolClient } from "pg";

export type SettingsSummary = {
  farmCount: number;
  paddockCount: number;
  assetCount: number;
  animalCount: number;
  userCount: number;
  activeUserCount: number;
  roleCount: number;
  inviteCount: number;
  pendingInviteCount: number;
  documentCount: number;
  pendingDocumentCount: number;
  expiringDocumentCount: number;
  currentRoleName: string | null;
  currentRoleCode: string | null;
  currentRolePermissions: Record<string, unknown>;
  isCurrentFarmOwner: boolean;
  canWriteFarm: boolean;
  canManageSettings: boolean;
  canManageUsers: boolean;
  canManageDocuments: boolean;
};

export type SettingsMapPoint = {
  lat: number;
  lng: number;
};

export type SettingsMapZone = {
  id: string;
  label: string;
  color: string | null;
  polygon: SettingsMapPoint[];
  kind: string | null;
};

export type SettingsStandardUnits = {
  animal_load?: string | null;
  area?: string | null;
  length?: string | null;
  mass?: string | null;
  spring?: string | null;
  temperature?: string | null;
  preferred_units?: string | null;
  volume?: string | null;
};

export type SettingsUserAccount = {
  member_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  phone: string | null;
  language: string | null;
  status: string;
  joined_at: string | null;
  base_role: string | null;
  farm_role: string | null;
  role_code: string | null;
  role_name: string | null;
  role_permissions: Record<string, unknown>;
  invite_status: string | null;
  invite_accepted: boolean;
  is_invite: boolean;
  is_owner: boolean;
  is_current_user: boolean;
};

export type SettingsDocument = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  status: string;
  file_url: string | null;
  note: string | null;
  is_shared: boolean;
  file_name: string | null;
  file_type: string | null;
  created_at: string | null;
};

export type SettingsProfile = {
  owner_id: string;
  full_name: string | null;
  email: string | null;
  farm_id: string | null;
  farm_code: string | null;
  farm_name: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  postal_code: string | null;
  state: string | null;
  country: string | null;
  farm_area_hectare: number | null;
  special_factors: string | null;
  other_activity: string | null;
  annual_rainfall: number | null;
  carrying_capacity: number | null;
  spring_start: string | null;
  location_name: string | null;
  maps_link: string | null;
  latitude: number | null;
  longitude: number | null;
  is_map_shared: boolean;
  standard_units: SettingsStandardUnits;
  map_zones: SettingsMapZone[];
  users: SettingsUserAccount[];
  documents: SettingsDocument[];
  settings_summary: SettingsSummary;
  current_role_code: string | null;
  current_role_name: string | null;
  current_role_permissions: Record<string, unknown>;
  is_current_farm_owner: boolean;
  can_write_farm: boolean;
  can_manage_settings: boolean;
  can_manage_users: boolean;
  can_manage_documents: boolean;
};

export class SettingsAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

type DeleteSettingsFarmOptions = {
  confirmFarmDeletion: boolean;
  confirmAccountDeletion: boolean;
};

export type DeleteSettingsFarmResult = {
  deletedFarmId: string;
  deletedAccount: boolean;
  wasFinalFarm: boolean;
};

const ZERO_SUMMARY: SettingsSummary = {
  farmCount: 0,
  paddockCount: 0,
  assetCount: 0,
  animalCount: 0,
  userCount: 0,
  activeUserCount: 0,
  roleCount: 0,
  inviteCount: 0,
  pendingInviteCount: 0,
  documentCount: 0,
  pendingDocumentCount: 0,
  expiringDocumentCount: 0,
  currentRoleName: null,
  currentRoleCode: null,
  currentRolePermissions: {},
  isCurrentFarmOwner: false,
  canWriteFarm: false,
  canManageSettings: false,
  canManageUsers: false,
  canManageDocuments: false,
};

const toNumberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const cleanStringOrNull = (value: unknown) => {
  if (typeof value !== "string") return null;
  const cleanValue = value.trim();
  return cleanValue ? cleanValue : null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const DEFAULT_STANDARD_UNITS: SettingsStandardUnits = {
  animal_load: "DSE",
  area: "Hectare",
  length: "Metric",
  mass: "Metric",
  spring: "1-Sep",
  temperature: "Celsius",
  preferred_units: "Metric",
  volume: "Metric",
};

function normalizeStandardUnits(value: unknown): SettingsStandardUnits {
  if (!isRecord(value)) return DEFAULT_STANDARD_UNITS;
  return {
    animal_load: typeof value.animal_load === "string" ? value.animal_load : DEFAULT_STANDARD_UNITS.animal_load,
    area: typeof value.area === "string" ? value.area : DEFAULT_STANDARD_UNITS.area,
    length: typeof value.length === "string" ? value.length : DEFAULT_STANDARD_UNITS.length,
    mass: typeof value.mass === "string" ? value.mass : DEFAULT_STANDARD_UNITS.mass,
    spring: typeof value.spring === "string" ? value.spring : DEFAULT_STANDARD_UNITS.spring,
    temperature: typeof value.temperature === "string" ? value.temperature : DEFAULT_STANDARD_UNITS.temperature,
    preferred_units: typeof value.preferred_units === "string" ? value.preferred_units : DEFAULT_STANDARD_UNITS.preferred_units,
    volume: typeof value.volume === "string" ? value.volume : DEFAULT_STANDARD_UNITS.volume,
  };
}

function metadataText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getAddressMetadata(value: unknown) {
  const metadata = isRecord(value) ? value : {};
  return {
    address_line_2: metadataText(metadata.address_line_2),
    city: metadataText(metadata.city),
    postal_code: metadataText(metadata.postal_code),
    state: metadataText(metadata.state),
    country: metadataText(metadata.country),
  };
}

function buildAddressMetadataPatch(body: Record<string, unknown>) {
  const patch: Record<string, string | null> = {};
  for (const key of ["address_line_2", "city", "postal_code", "state", "country"] as const) {
    if (key in body) patch[key] = cleanStringOrNull(body[key]);
  }
  return patch;
}

function buildStandardUnitsPatch(value: unknown) {
  if (!isRecord(value)) return null;
  return {
    ...DEFAULT_STANDARD_UNITS,
    animal_load: cleanStringOrNull(value.animal_load) ?? DEFAULT_STANDARD_UNITS.animal_load,
    area: cleanStringOrNull(value.area) ?? DEFAULT_STANDARD_UNITS.area,
    length: cleanStringOrNull(value.length) ?? DEFAULT_STANDARD_UNITS.length,
    mass: cleanStringOrNull(value.mass) ?? DEFAULT_STANDARD_UNITS.mass,
    spring: cleanStringOrNull(value.spring) ?? DEFAULT_STANDARD_UNITS.spring,
    temperature: cleanStringOrNull(value.temperature) ?? DEFAULT_STANDARD_UNITS.temperature,
    preferred_units: cleanStringOrNull(value.preferred_units) ?? DEFAULT_STANDARD_UNITS.preferred_units,
    volume: cleanStringOrNull(value.volume) ?? DEFAULT_STANDARD_UNITS.volume,
  };
}

async function deleteIfTablesExist(client: PoolClient, tableNames: string[], sql: string, params: unknown[]) {
  const result = await client.query(
    `select bool_and(to_regclass(table_name) is not null) as all_exist
     from unnest($1::text[]) as tables(table_name)`,
    [tableNames]
  );
  if (result.rows[0]?.all_exist) {
    await client.query(sql, params);
  }
}

async function deleteFarmBlockingData(client: PoolClient, farmId: string) {
  await deleteIfTablesExist(
    client,
    ["du_lieu.dieu_tri_vat_nuoi_ca_the", "du_lieu.dieu_tri_vat_nuoi"],
    `delete from du_lieu.dieu_tri_vat_nuoi_ca_the
     where dieu_tri_id in (select id from du_lieu.dieu_tri_vat_nuoi where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(
    client,
    ["du_lieu.su_kien_vat_nuoi_ca_the", "du_lieu.su_kien_vat_nuoi"],
    `delete from du_lieu.su_kien_vat_nuoi_ca_the
     where su_kien_id in (select id from du_lieu.su_kien_vat_nuoi where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(
    client,
    ["du_lieu.ke_hoach_chan_tha_khu_vuc", "du_lieu.ke_hoach_chan_tha"],
    `delete from du_lieu.ke_hoach_chan_tha_khu_vuc
     where ke_hoach_id in (select id from du_lieu.ke_hoach_chan_tha where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(
    client,
    ["du_lieu.ke_hoach_chan_tha_nhom_vat_nuoi", "du_lieu.ke_hoach_chan_tha"],
    `delete from du_lieu.ke_hoach_chan_tha_nhom_vat_nuoi
     where ke_hoach_id in (select id from du_lieu.ke_hoach_chan_tha where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(
    client,
    ["du_lieu.su_kien_chan_tha", "du_lieu.ke_hoach_chan_tha"],
    `delete from du_lieu.su_kien_chan_tha
     where ke_hoach_id in (select id from du_lieu.ke_hoach_chan_tha where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(
    client,
    ["du_lieu.cong_viec_hang_muc", "du_lieu.cong_viec"],
    `delete from du_lieu.cong_viec_hang_muc
     where cong_viec_id in (select id from du_lieu.cong_viec where trang_trai_id = $1)`,
    [farmId]
  );
  await deleteIfTablesExist(client, ["du_lieu.kho_vat_tu_giao_dich"], `delete from du_lieu.kho_vat_tu_giao_dich where trang_trai_id = $1`, [farmId]);
  await deleteIfTablesExist(client, ["du_lieu.dieu_tri_vat_nuoi"], `delete from du_lieu.dieu_tri_vat_nuoi where trang_trai_id = $1`, [farmId]);
  await deleteIfTablesExist(client, ["du_lieu.su_kien_vat_nuoi"], `delete from du_lieu.su_kien_vat_nuoi where trang_trai_id = $1`, [farmId]);
  await deleteIfTablesExist(client, ["du_lieu.ke_hoach_chan_tha"], `delete from du_lieu.ke_hoach_chan_tha where trang_trai_id = $1`, [farmId]);
  await deleteIfTablesExist(client, ["du_lieu.cong_viec"], `delete from du_lieu.cong_viec where trang_trai_id = $1`, [farmId]);
  await deleteIfTablesExist(client, ["du_lieu.thanh_vien_trang_trai"], `delete from du_lieu.thanh_vien_trang_trai where trang_trai_id = $1`, [farmId]);
}

function extractPolygon(value: unknown): SettingsMapPoint[] {
  if (!isRecord(value)) return [];
  const geo = isRecord(value.geo) ? value.geo : value;
  const rawPolygon = Array.isArray(geo.polygon) ? geo.polygon : [];
  return rawPolygon
    .map((point) => {
      if (!isRecord(point)) return null;
      const lat = toNumberOrNull(point.lat);
      const lng = toNumberOrNull(point.lng);
      return lat === null || lng === null ? null : { lat, lng };
    })
    .filter((point): point is SettingsMapPoint => Boolean(point));
}

async function getSettingsMapZones(farmId: string): Promise<SettingsMapZone[]> {
  const zones = await db.query(
    `select id::text,
            coalesce(nullif(ten_khu_vuc, ''), ma_khu_vuc, 'Khu vực trang trại') as label,
            coalesce(mau_sac, hinh_hoc_geojson->'metadata'->>'areaColor', hinh_hoc_geojson->'metadata'->>'area_color') as color,
            coalesce(nullif(loai_khu_vuc, ''), hinh_hoc_geojson->'metadata'->>'kind', hinh_hoc_geojson->'metadata'->>'areaType') as kind,
            hinh_hoc_geojson
     from du_lieu.khu_vuc
     where trang_trai_id = $1
       and coalesce(lower(trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')
     order by created_at asc
     limit 80`,
    [farmId]
  );

  return zones.rows
    .map((row) => ({
      id: String(row.id),
      label: String(row.label ?? "Khu vực trang trại"),
      color: row.color ? String(row.color) : null,
      polygon: extractPolygon(row.hinh_hoc_geojson),
      kind: row.kind ? String(row.kind) : null,
    }))
    .filter((zone) => zone.polygon.length >= 3);
}

async function getSettingsUsers(ownerId: string, farmId: string): Promise<SettingsUserAccount[]> {
  const users = await db.query(
    `select
       tv.id::text as member_id,
       u.id::text as user_id,
       u.ho_ten as full_name,
       u.email,
       u.anh_dai_dien_url as avatar_url,
       u.so_dien_thoai as phone,
       u.ngon_ngu as language,
       tv.trang_thai as status,
       tv.ngay_tham_gia as joined_at,
       tv.metadata_json as member_metadata,
       vt.ma_vai_tro as role_code,
       vt.ten_vai_tro as role_name,
       vt.quyen as role_permissions,
       (u.id = t.chu_so_huu_id) as is_owner,
       (u.id = $2::uuid) as is_current_user
     from du_lieu.thanh_vien_trang_trai tv
     join du_lieu.nguoi_dung u on u.id = tv.nguoi_dung_id
     join du_lieu.trang_trai t on t.id = tv.trang_trai_id
     left join du_lieu.vai_tro_trang_trai vt on vt.id = tv.vai_tro_id
     where tv.trang_trai_id = $1
     order by
       case
         when u.id = $2::uuid then 0
         when u.id = t.chu_so_huu_id then 1
         else 2
       end,
       tv.ngay_tham_gia asc nulls last,
       u.ho_ten asc nulls last`,
    [farmId, ownerId]
  );

  const members = users.rows.map((row) => {
    const metadata = isRecord(row.member_metadata) ? row.member_metadata : {};
    const isOwner = Boolean(row.is_owner);
    const baseRole = isOwner ? "owner" : typeof metadata.base_role === "string" ? metadata.base_role : null;
    const farmRole = isOwner ? "owner" : typeof metadata.farm_role === "string" ? metadata.farm_role : null;

    return {
      member_id: String(row.member_id),
      user_id: String(row.user_id),
      full_name: row.full_name ? String(row.full_name) : null,
      email: row.email ? String(row.email) : null,
      avatar_url: row.avatar_url ? String(row.avatar_url) : null,
      phone: row.phone ? String(row.phone) : null,
      language: row.language ? String(row.language) : null,
      status: row.status ? String(row.status) : "active",
      joined_at: row.joined_at ? new Date(row.joined_at).toISOString() : null,
      base_role: baseRole,
      farm_role: farmRole,
      role_code: isOwner ? "owner" : row.role_code ? String(row.role_code) : null,
      role_name: isOwner ? "Chủ sở hữu" : row.role_name ? String(row.role_name) : null,
      role_permissions: isRecord(row.role_permissions) ? row.role_permissions : {},
      invite_status: "accepted",
      invite_accepted: true,
      is_invite: false,
      is_owner: isOwner,
      is_current_user: Boolean(row.is_current_user),
    };
  });

  const invites = await db.query(
    `select
       lm.id::text as invite_id,
       lm.email,
       lm.ho_ten as full_name,
       lm.so_dien_thoai as phone,
       lm.ngon_ngu as language,
       lm.trang_thai as invite_status,
       lm.created_at,
       lm.updated_at,
       vt.ma_vai_tro as role_code,
       vt.ten_vai_tro as role_name,
       vt.quyen as role_permissions
     from du_lieu.loi_moi_trang_trai lm
     left join du_lieu.vai_tro_trang_trai vt on vt.id = lm.vai_tro_id
     where lm.trang_trai_id = $1
       and coalesce(lm.metadata_json->>'deleted_by_owner', 'false') <> 'true'
       and (
         lower(coalesce(lm.trang_thai, 'pending')) = 'pending'
         or (
           lower(coalesce(lm.trang_thai, 'pending')) in ('expired', 'declined')
           and lm.updated_at > now() - interval '1 month'
         )
       )
     order by
       case lower(coalesce(lm.trang_thai, 'pending'))
         when 'pending' then 0
         when 'declined' then 1
         when 'expired' then 2
         else 3
       end,
       lm.updated_at desc nulls last,
       lm.created_at desc nulls last`,
    [farmId]
  );

  const activeInviteEmails = new Set(invites.rows.map((row) => row.email ? String(row.email).toLowerCase() : "").filter(Boolean));
  const visibleMembers = members.filter((member) => {
    const email = member.email?.toLowerCase();
    return !email || !activeInviteEmails.has(email);
  });
  const visibleMemberEmails = new Set(visibleMembers.map((member) => member.email?.toLowerCase()).filter(Boolean));

  const pendingInvites: SettingsUserAccount[] = invites.rows
    .filter((row) => {
      const email = row.email ? String(row.email).toLowerCase() : "";
      return email && !visibleMemberEmails.has(email);
    })
    .map((row) => {
      const email = row.email ? String(row.email) : null;
      const inviteStatus = row.invite_status ? String(row.invite_status) : "pending";
      return {
        member_id: `invite-${String(row.invite_id)}`,
        user_id: "",
        full_name: row.full_name ? String(row.full_name) : email ? email.split("@")[0] : null,
        email,
        avatar_url: null,
        phone: row.phone ? String(row.phone) : null,
        language: row.language ? String(row.language) : null,
        status: inviteStatus,
        joined_at: row.updated_at ? new Date(row.updated_at).toISOString() : row.created_at ? new Date(row.created_at).toISOString() : null,
        base_role: row.role_code ? String(row.role_code) : null,
        farm_role: row.role_code ? String(row.role_code) : null,
        role_code: row.role_code ? String(row.role_code) : null,
        role_name: row.role_name ? String(row.role_name) : null,
        role_permissions: isRecord(row.role_permissions) ? row.role_permissions : {},
        invite_status: inviteStatus,
        invite_accepted: false,
        is_invite: true,
        is_owner: false,
        is_current_user: false,
      };
    });

  return [...visibleMembers, ...pendingInvites];
}

async function getSettingsDocuments(farmId: string): Promise<SettingsDocument[]> {
  const result = await db.query(
    `select id::text,
            ma_chung_tu,
            ten_chung_tu,
            loai_chung_tu,
            so_chung_tu,
            ngay_ban_hanh,
            ngay_het_han,
            trang_thai,
            tep_dinh_kem_url,
            ghi_chu,
            metadata_json,
            created_at
     from du_lieu.chung_tu_trang_trai
     where trang_trai_id = $1
     order by created_at desc nulls last, ten_chung_tu asc`,
    [farmId]
  );

  return result.rows.map((row) => {
    const metadata = isRecord(row.metadata_json) ? row.metadata_json : {};
    return {
      id: String(row.id),
      code: String(row.ma_chung_tu ?? ""),
      name: String(row.ten_chung_tu ?? "Chứng từ"),
      type: row.loai_chung_tu ? String(row.loai_chung_tu) : null,
      number: row.so_chung_tu ? String(row.so_chung_tu) : null,
      issued_at: row.ngay_ban_hanh ? new Date(row.ngay_ban_hanh).toISOString().slice(0, 10) : null,
      expires_at: row.ngay_het_han ? new Date(row.ngay_het_han).toISOString().slice(0, 10) : null,
      status: row.trang_thai ? String(row.trang_thai) : "active",
      file_url: row.tep_dinh_kem_url ? withBasePath(String(row.tep_dinh_kem_url)) : null,
      note: row.ghi_chu ? String(row.ghi_chu) : null,
      is_shared: metadata.is_shared === true,
      file_name: typeof metadata.file_name === "string" ? metadata.file_name : null,
      file_type: typeof metadata.file_type === "string" ? metadata.file_type : null,
      created_at: row.created_at ? new Date(row.created_at).toISOString() : null,
    };
  });
}

async function getSettingsStats(ownerId: string, farmId: string, access: FarmAccess): Promise<SettingsSummary> {
  const [stats, farmCount] = await Promise.all([
    db.query(
    `select
       (select count(*)::int from du_lieu.trang_trai where chu_so_huu_id = $1) as farm_count,
       (select count(*)::int from du_lieu.khu_vuc where trang_trai_id = $2 and coalesce(lower(trang_thai), '') not in ('da_huy', 'da huy', 'đã hủy', 'dã hủy', 'cancelled')) as paddock_count,
       (select count(*)::int from du_lieu.tai_san_rao where trang_trai_id = $2) as asset_count,
       (select count(*)::int from du_lieu.vat_nuoi where trang_trai_id = $2) as animal_count,
       (
         select count(*)::int
         from du_lieu.thanh_vien_trang_trai tv
         join du_lieu.nguoi_dung u on u.id = tv.nguoi_dung_id
         where tv.trang_trai_id = $2
           and not exists (
             select 1
             from du_lieu.loi_moi_trang_trai lm
             where lm.trang_trai_id = tv.trang_trai_id
               and lower(lm.email) = lower(u.email)
               and lower(coalesce(lm.trang_thai, 'pending')) = 'pending'
           )
       ) as user_count,
       (
         select count(*)::int
         from du_lieu.thanh_vien_trang_trai tv
         join du_lieu.nguoi_dung u on u.id = tv.nguoi_dung_id
         where tv.trang_trai_id = $2
           and lower(tv.trang_thai) = 'active'
           and not exists (
             select 1
             from du_lieu.loi_moi_trang_trai lm
             where lm.trang_trai_id = tv.trang_trai_id
               and lower(lm.email) = lower(u.email)
               and lower(coalesce(lm.trang_thai, 'pending')) = 'pending'
           )
       ) as active_user_count,
       (select count(*)::int from du_lieu.vai_tro_trang_trai where trang_trai_id = $2) as role_count,
       (select count(*)::int from du_lieu.loi_moi_trang_trai where trang_trai_id = $2) as invite_count,
       (select count(*)::int from du_lieu.loi_moi_trang_trai where trang_trai_id = $2 and lower(trang_thai) = 'pending') as pending_invite_count,
       (select count(*)::int from du_lieu.chung_tu_trang_trai where trang_trai_id = $2) as document_count,
       (select count(*)::int from du_lieu.chung_tu_trang_trai where trang_trai_id = $2 and lower(trang_thai) in ('pending', 'cho_duyet')) as pending_document_count,
       (select count(*)::int from du_lieu.chung_tu_trang_trai where trang_trai_id = $2 and ngay_het_han between current_date and current_date + interval '30 days') as expiring_document_count,
       (
         select vt.ten_vai_tro
         from du_lieu.thanh_vien_trang_trai tv
         join du_lieu.vai_tro_trang_trai vt on vt.id = tv.vai_tro_id
         where tv.trang_trai_id = $2 and tv.nguoi_dung_id = $1
         limit 1
       ) as current_role_name`,
      [ownerId, farmId]
    ),
    getAccessibleFarmCount(ownerId),
  ]);

  const row = stats.rows[0] ?? {};
  return {
    farmCount,
    paddockCount: Number(row.paddock_count ?? 0),
    assetCount: Number(row.asset_count ?? 0),
    animalCount: Number(row.animal_count ?? 0),
    userCount: Number(row.user_count ?? 0),
    activeUserCount: Number(row.active_user_count ?? 0),
    roleCount: Number(row.role_count ?? 0),
    inviteCount: Number(row.invite_count ?? 0),
    pendingInviteCount: Number(row.pending_invite_count ?? 0),
    documentCount: Number(row.document_count ?? 0),
    pendingDocumentCount: Number(row.pending_document_count ?? 0),
    expiringDocumentCount: Number(row.expiring_document_count ?? 0),
    currentRoleName: access.roleName,
    currentRoleCode: access.roleCode,
    currentRolePermissions: access.permissions,
    isCurrentFarmOwner: access.isOwner,
    canWriteFarm: access.canWrite,
    canManageSettings: access.canManageSettings,
    canManageUsers: access.canManageUsers,
    canManageDocuments: access.canManageDocuments,
  };
}

export async function loadSettingsProfile(ownerId: string): Promise<SettingsProfile | null> {
  await ensureSettingsSchema();

  const profileResult = await db.query(
    `select
       u.id as owner_id,
       u.ho_ten as full_name,
       u.email,
       t.id as farm_id,
       t.ma_trang_trai as farm_code,
       t.ten_trang_trai as farm_name,
       t.dia_chi as address_line_1,
       t.is_map_shared,
       s.dien_tich_ha as farm_area_hectare,
       s.yeu_to_dac_biet as special_factors,
       s.hoat_dong_khac as other_activity,
       s.luong_mua_hang_nam as annual_rainfall,
       s.suc_tai_chan_tha as carrying_capacity,
       s.mua_xuan_bat_dau as spring_start,
       s.don_vi_tieu_chuan as standard_units,
       s.metadata_json as settings_metadata,
       v.ten_dia_diem as location_name,
       v.maps_link,
       v.vi_do as latitude,
       v.kinh_do as longitude
     from du_lieu.nguoi_dung u
     left join lateral (
       select t.*
       from du_lieu.trang_trai t
       left join du_lieu.thanh_vien_trang_trai tv
         on tv.trang_trai_id = t.id
        and tv.nguoi_dung_id = u.id
        and lower(coalesce(tv.trang_thai, 'active')) = 'active'
       where t.chu_so_huu_id = u.id
          or tv.nguoi_dung_id = u.id
       order by
         case
           when tv.metadata_json->>'source' = 'invite' then 0
           when t.chu_so_huu_id = u.id then 1
           else 2
         end,
         coalesce(tv.updated_at, tv.ngay_tham_gia, t.updated_at, t.created_at) desc nulls last,
         t.created_at desc nulls last,
         t.id desc
       limit 1
     ) t on true
     left join du_lieu.cai_dat_trang_trai s on s.trang_trai_id = t.id
     left join lateral (
       select *
       from du_lieu.vi_tri_trang_trai
       where trang_trai_id = t.id
       order by created_at desc nulls last, id desc
       limit 1
     ) v on true
     where u.id = $1
     limit 1`,
    [ownerId]
  );

  const row = profileResult.rows[0];
  if (!row) return null;

  const farmId = row.farm_id ? String(row.farm_id) : null;
  const access = farmId ? await getAccessibleFarm(ownerId, farmId) : null;

  if (farmId && access?.isOwner) {
    await ensureFarmSettingsDefaults(farmId, access.ownerId);
  }

  if (farmId && access?.canManageUsers) {
    await expireFarmInvitations(farmId);
  }

  const [summary, mapZones, settingsUsers, documents] = farmId && access
    ? await Promise.all([getSettingsStats(ownerId, farmId, access), getSettingsMapZones(farmId), getSettingsUsers(ownerId, farmId), getSettingsDocuments(farmId)])
    : [ZERO_SUMMARY, [] as SettingsMapZone[], [] as SettingsUserAccount[], [] as SettingsDocument[]];
  const users = access?.canManageUsers ? settingsUsers : settingsUsers.filter((user) => user.is_current_user);
  const addressMetadata = getAddressMetadata(row.settings_metadata);

  return {
    owner_id: String(row.owner_id),
    full_name: row.full_name ? String(row.full_name) : null,
    email: row.email ? String(row.email) : null,
    farm_id: row.farm_id ? String(row.farm_id) : null,
    farm_code: row.farm_code ? String(row.farm_code) : null,
    farm_name: row.farm_name ? String(row.farm_name) : null,
    address_line_1: row.address_line_1 ? String(row.address_line_1) : row.location_name ? String(row.location_name) : null,
    ...addressMetadata,
    farm_area_hectare: toNumberOrNull(row.farm_area_hectare),
    special_factors: row.special_factors ? String(row.special_factors) : null,
    other_activity: row.other_activity ? String(row.other_activity) : null,
    annual_rainfall: toNumberOrNull(row.annual_rainfall),
    carrying_capacity: toNumberOrNull(row.carrying_capacity),
    spring_start: row.spring_start ? String(row.spring_start) : null,
    location_name: row.location_name ? String(row.location_name) : null,
    maps_link: row.maps_link ? String(row.maps_link) : null,
    latitude: toNumberOrNull(row.latitude),
    longitude: toNumberOrNull(row.longitude),
    is_map_shared: Boolean(row.is_map_shared),
    standard_units: normalizeStandardUnits(row.standard_units),
    map_zones: mapZones,
    users,
    documents,
    settings_summary: summary,
    current_role_code: summary.currentRoleCode,
    current_role_name: summary.currentRoleName,
    current_role_permissions: summary.currentRolePermissions,
    is_current_farm_owner: summary.isCurrentFarmOwner,
    can_write_farm: summary.canWriteFarm,
    can_manage_settings: summary.canManageSettings,
    can_manage_users: summary.canManageUsers,
    can_manage_documents: summary.canManageDocuments,
  };
}

export async function updateSettingsProfile(ownerId: string, body: Record<string, unknown>) {
  await ensureSettingsSchema();

  const requestedFarmId = typeof body.farm_id === "string" && body.farm_id.trim() ? body.farm_id.trim() : null;
  const access = await getAccessibleFarm(ownerId, requestedFarmId);
  if (requestedFarmId && !access) {
    throw new SettingsAccessError("Bạn không có quyền truy cập trang trại này.", 403);
  }
  if (access && !access.canManageSettings) {
    throw new SettingsAccessError("Bạn không có quyền cập nhật cài đặt trang trại này.", 403);
  }

  const client = await db.connect();
  try {
    await client.query("begin");

    await client.query(
      `update du_lieu.nguoi_dung
       set ho_ten = coalesce(nullif($2, ''), ho_ten),
           email = coalesce(nullif($3, ''), email),
           updated_at = now()
       where id = $1`,
      [ownerId, typeof body.full_name === "string" ? body.full_name.trim() : null, typeof body.email === "string" ? body.email.trim() : null]
    );

    const nextLatitude = toNumberOrNull(body.latitude);
    const nextLongitude = toNumberOrNull(body.longitude);
    const addressLine1 = cleanStringOrNull(body.address_line_1) ?? cleanStringOrNull(body.location_name);
    const standardUnitsPatch = buildStandardUnitsPatch(body.standard_units);
    const addressMetadataPatch = buildAddressMetadataPatch(body);
    const addressMetadataJson = JSON.stringify(addressMetadataPatch);

    let farmId = requestedFarmId ?? access?.farmId ?? null;
    if (!farmId) {
      const existing = await client.query(
        `select id from du_lieu.trang_trai where chu_so_huu_id = $1 order by created_at desc nulls last limit 1`,
        [ownerId]
      );
      farmId = existing.rows[0]?.id ? String(existing.rows[0].id) : null;
    }

    if (!farmId) {
      const createdFarmId = randomUUID();
      const created = await client.query(
        `insert into du_lieu.trang_trai (id, chu_so_huu_id, ma_trang_trai, ten_trang_trai, dia_chi, kinh_do, vi_do, is_map_shared)
         values ($1, $2, $3, coalesce(nullif($4, ''), 'Trang trai'), $5, $6, $7, coalesce($8, false))
         returning id`,
        [
          createdFarmId,
          ownerId,
          `FARM-${createdFarmId.slice(0, 8)}`,
          typeof body.farm_name === "string" ? body.farm_name.trim() : null,
          addressLine1,
          nextLongitude,
          nextLatitude,
          typeof body.is_map_shared === "boolean" ? body.is_map_shared : false,
        ]
      );
      farmId = String(created.rows[0].id);
    } else {
      await client.query(
        `update du_lieu.trang_trai
         set ten_trang_trai = coalesce(nullif($2, ''), ten_trang_trai),
             dia_chi = coalesce($3, dia_chi),
             kinh_do = coalesce($4, kinh_do),
             vi_do = coalesce($5, vi_do),
             is_map_shared = coalesce($6, is_map_shared),
             updated_at = now()
         where id = $1`,
        [
          farmId,
          typeof body.farm_name === "string" ? body.farm_name.trim() : null,
          addressLine1,
          nextLongitude,
          nextLatitude,
          typeof body.is_map_shared === "boolean" ? body.is_map_shared : null,
        ]
      );
    }

    await client.query(
      `insert into du_lieu.cai_dat_trang_trai
        (trang_trai_id, dien_tich_ha, yeu_to_dac_biet, hoat_dong_khac, luong_mua_hang_nam, suc_tai_chan_tha, mua_xuan_bat_dau, don_vi_tieu_chuan, metadata_json)
       values ($1, $2, $3, $4, $5, $6, $7, coalesce($8::jsonb, '${JSON.stringify(DEFAULT_STANDARD_UNITS)}'::jsonb), $9::jsonb)
       on conflict (trang_trai_id) do update
       set dien_tich_ha = excluded.dien_tich_ha,
           yeu_to_dac_biet = excluded.yeu_to_dac_biet,
           hoat_dong_khac = excluded.hoat_dong_khac,
           luong_mua_hang_nam = excluded.luong_mua_hang_nam,
           suc_tai_chan_tha = excluded.suc_tai_chan_tha,
           mua_xuan_bat_dau = excluded.mua_xuan_bat_dau,
           don_vi_tieu_chuan = case
             when $8::jsonb is null then du_lieu.cai_dat_trang_trai.don_vi_tieu_chuan
             else excluded.don_vi_tieu_chuan
           end,
           metadata_json = coalesce(du_lieu.cai_dat_trang_trai.metadata_json, '{}'::jsonb) || excluded.metadata_json,
           updated_at = now()`,
      [
        farmId,
        toNumberOrNull(body.farm_area_hectare),
        typeof body.special_factors === "string" ? body.special_factors : null,
        typeof body.other_activity === "string" ? body.other_activity : null,
        toNumberOrNull(body.annual_rainfall),
        toNumberOrNull(body.carrying_capacity),
        typeof body.spring_start === "string" ? body.spring_start : null,
        standardUnitsPatch ? JSON.stringify(standardUnitsPatch) : null,
        addressMetadataJson,
      ]
    );

    const locationUpdate = await client.query(
      `update du_lieu.vi_tri_trang_trai
       set ten_dia_diem = $2,
           maps_link = $3,
           kinh_do = $4,
           vi_do = $5,
           updated_at = now()
       where id = (
         select id from du_lieu.vi_tri_trang_trai
         where trang_trai_id = $1
         order by created_at desc nulls last, id desc
         limit 1
       )`,
      [
        farmId,
        addressLine1,
        typeof body.maps_link === "string" ? body.maps_link : null,
        nextLongitude,
        nextLatitude,
      ]
    );

    if (locationUpdate.rowCount === 0) {
      await client.query(
        `insert into du_lieu.vi_tri_trang_trai (id, trang_trai_id, ten_dia_diem, maps_link, kinh_do, vi_do)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          randomUUID(),
          farmId,
          addressLine1,
          typeof body.maps_link === "string" ? body.maps_link : null,
          nextLongitude,
          nextLatitude,
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteSettingsFarm(ownerId: string, farmId: string | null, options: DeleteSettingsFarmOptions): Promise<DeleteSettingsFarmResult> {
  await ensureSettingsSchema();

  const access = await getAccessibleFarm(ownerId, farmId);
  if (!access) {
    throw new SettingsAccessError("Không tìm thấy trang trại để xóa.", 404);
  }
  if (!access.isOwner) {
    throw new SettingsAccessError("Chỉ chủ sở hữu mới được xóa trang trại.", 403);
  }

  const client = await db.connect();
  try {
    await client.query("begin");

    const farmResult = await client.query(
      `select id::text
       from du_lieu.trang_trai
       where chu_so_huu_id = $1
         and ($2::uuid is null or id = $2::uuid)
       order by created_at desc nulls last, id desc
       limit 1
       for update`,
      [ownerId, access.farmId]
    );
    const targetFarmId = farmResult.rows[0]?.id ? String(farmResult.rows[0].id) : null;
    if (!targetFarmId) {
      throw new Error("Không tìm thấy trang trại để xóa.");
    }

    const farmCountResult = await client.query(
      `select count(*)::int as farm_count
       from du_lieu.trang_trai
       where chu_so_huu_id = $1`,
      [ownerId]
    );
    const farmCount = Number(farmCountResult.rows[0]?.farm_count ?? 0);
    const wasFinalFarm = farmCount <= 1;

    if (!options.confirmFarmDeletion) {
      throw new Error("Cần xác nhận xóa trang trại trước khi tiếp tục.");
    }
    if (wasFinalFarm && !options.confirmAccountDeletion) {
      throw new Error("Đây là trang trại cuối cùng. Cần xác nhận xóa tài khoản trước khi tiếp tục.");
    }

    await deleteFarmBlockingData(client, targetFarmId);

    const deletedFarm = await client.query(
      `delete from du_lieu.trang_trai
       where id = $1 and chu_so_huu_id = $2
       returning id`,
      [targetFarmId, ownerId]
    );
    if (deletedFarm.rowCount === 0) {
      throw new Error("Không tìm thấy trang trại để xóa.");
    }

    if (wasFinalFarm) {
      const deletedAccount = await client.query(`delete from du_lieu.nguoi_dung where id = $1 returning id`, [ownerId]);
      if (deletedAccount.rowCount === 0) {
        throw new Error("Không thể xóa tài khoản sau khi xóa trang trại cuối cùng.");
      }
    }

    await client.query("commit");

    return {
      deletedFarmId: targetFarmId,
      deletedAccount: wasFinalFarm,
      wasFinalFarm,
    };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
