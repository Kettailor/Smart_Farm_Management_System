import { db } from "@/lib/db";
import { shouldRunRuntimeSchemaSync } from "@/lib/schema-sync";

export type DiemThoiTietTheoGio = {
  thoi_gian: string;
  nhiet_do_c: number | null;
  do_am_pct: number | null;
  diem_suong_c: number | null;
  xac_suat_mua_pct: number | null;
  luong_mua_mm: number | null;
  ap_suat_hpa: number | null;
  gio_km_h: number | null;
  huong_gio_do: number | null;
  gio_giat_km_h: number | null;
  tam_nhin_km: number | null;
  uv: number | null;
  may_pct: number | null;
  ma_thoi_tiet: number | null;
};

export type DuBaoNgay = {
  ngay: string;
  ma_thoi_tiet: number | null;
  mo_ta: string;
  nhiet_do_cao_nhat_c: number | null;
  nhiet_do_thap_nhat_c: number | null;
  mua_mm: number | null;
  xac_suat_mua_cao_nhat_pct: number | null;
  uv_cao_nhat: number | null;
  gio_cao_nhat_km_h: number | null;
  huong_gio_chu_dao_do: number | null;
  binh_minh: string | null;
  hoang_hon: string | null;
};

export type DuLieuThoiTiet = {
  vi_do: number;
  kinh_do: number;
  nguon_du_lieu: string;
  thu_vien_bieu_do: string;
  cap_nhat_luc: string;
  het_han_luc: string;
  mui_gio: string | null;
  hien_tai: {
    nhiet_do_c: number | null;
    cam_giac_c: number | null;
    do_am_pct: number | null;
    diem_suong_c: number | null;
    luong_mua_mm: number | null;
    ap_suat_hpa: number | null;
    gio_km_h: number | null;
    huong_gio_do: number | null;
    gio_giat_km_h: number | null;
    tam_nhin_km: number | null;
    uv: number | null;
    may_pct: number | null;
    ma_thoi_tiet: number | null;
    mo_ta: string;
    thoi_gian: string | null;
  };
  theo_gio: DiemThoiTietTheoGio[];
  du_bao_ngay: DuBaoNgay[];
  du_bao_3_ngay: DuBaoNgay[];
};

const THOI_GIAN_CACHE_PHUT = 30;
const FORECAST_DAYS = 7;
const HOURLY_FORECAST_HOURS = FORECAST_DAYS * 24;
const CACHE_DB_UNAVAILABLE = "weather_cache_db_unavailable";

type OpenMeteoHourly = {
  time?: string[];
  temperature_2m?: Array<number | null>;
  relative_humidity_2m?: Array<number | null>;
  dew_point_2m?: Array<number | null>;
  precipitation_probability?: Array<number | null>;
  precipitation?: Array<number | null>;
  pressure_msl?: Array<number | null>;
  wind_speed_10m?: Array<number | null>;
  wind_direction_10m?: Array<number | null>;
  wind_gusts_10m?: Array<number | null>;
  visibility?: Array<number | null>;
  uv_index?: Array<number | null>;
  cloud_cover?: Array<number | null>;
  weather_code?: Array<number | null>;
};

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: Array<number | null>;
  temperature_2m_max?: Array<number | null>;
  temperature_2m_min?: Array<number | null>;
  precipitation_sum?: Array<number | null>;
  precipitation_probability_max?: Array<number | null>;
  uv_index_max?: Array<number | null>;
  wind_speed_10m_max?: Array<number | null>;
  wind_direction_10m_dominant?: Array<number | null>;
  sunrise?: Array<string | null>;
  sunset?: Array<string | null>;
};

type OpenMeteoCurrent = {
  time?: string | null;
  temperature_2m?: number | null;
  relative_humidity_2m?: number | null;
  apparent_temperature?: number | null;
  precipitation?: number | null;
  weather_code?: number | null;
  cloud_cover?: number | null;
  pressure_msl?: number | null;
  wind_speed_10m?: number | null;
  wind_direction_10m?: number | null;
  wind_gusts_10m?: number | null;
};

type OpenMeteoResponse = {
  timezone?: string | null;
  current?: OpenMeteoCurrent;
  hourly?: OpenMeteoHourly;
  daily?: OpenMeteoDaily;
};

type WeatherCacheRow = {
  vi_do: string | number;
  kinh_do: string | number;
  nguon_du_lieu: string;
  cap_nhat_luc: string | Date;
  het_han_luc: string | Date;
  du_lieu_hien_tai: DuLieuThoiTiet["hien_tai"];
  du_lieu_du_bao: DuBaoNgay[];
  du_lieu_theo_gio?: DiemThoiTietTheoGio[];
  du_lieu_meta?: { timezone?: string | null };
};

const lamTronToaDo = (v: number) => Number(v.toFixed(3));
const taoViTriMa = (viDo: number, kinhDo: number) => `${lamTronToaDo(viDo)}_${lamTronToaDo(kinhDo)}`;
const soHoacNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

export function moTaMaThoiTiet(code: number | null | undefined) {
  switch (code) {
    case 0:
      return "Trời quang";
    case 1:
      return "Ít mây";
    case 2:
      return "Có mây";
    case 3:
      return "Nhiều mây";
    case 45:
    case 48:
      return "Sương mù";
    case 51:
    case 53:
    case 55:
      return "Mưa phùn";
    case 56:
    case 57:
      return "Mưa phùn lạnh";
    case 61:
    case 63:
    case 65:
      return "Mưa";
    case 66:
    case 67:
      return "Mưa lạnh";
    case 71:
    case 73:
    case 75:
    case 77:
      return "Tuyết";
    case 80:
    case 81:
    case 82:
      return "Mưa rào";
    case 85:
    case 86:
      return "Mưa tuyết";
    case 95:
      return "Dông";
    case 96:
    case 99:
      return "Dông kèm mưa đá";
    default:
      return "Chưa xác định";
  }
}

async function taoBangNeuChuaCo() {
  if (!shouldRunRuntimeSchemaSync()) return;
  await db.query(`
    create table if not exists du_lieu.thoi_tiet_bo_nho_dem (
      vi_tri_ma text primary key,
      vi_do numeric(9,3) not null,
      kinh_do numeric(9,3) not null,
      du_lieu_hien_tai jsonb not null,
      du_lieu_du_bao jsonb not null,
      du_lieu_theo_gio jsonb not null default '[]'::jsonb,
      du_lieu_meta jsonb not null default '{}'::jsonb,
      nguon_du_lieu text not null,
      cap_nhat_luc timestamptz not null,
      het_han_luc timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);

  await db.query(`
    alter table du_lieu.thoi_tiet_bo_nho_dem
      add column if not exists du_lieu_theo_gio jsonb not null default '[]'::jsonb,
      add column if not exists du_lieu_meta jsonb not null default '{}'::jsonb
  `);
}

function taoKetQuaKhongCache(
  viDo: number,
  kinhDo: number,
  tuNguonNgoai: Awaited<ReturnType<typeof goiNguonNgoai>>,
  capNhat = new Date()
): DuLieuThoiTiet {
  const hetHan = new Date(capNhat.getTime() + THOI_GIAN_CACHE_PHUT * 60 * 1000);

  return {
    vi_do: viDo,
    kinh_do: kinhDo,
    nguon_du_lieu: tuNguonNgoai.nguon,
    thu_vien_bieu_do: "recharts",
    cap_nhat_luc: capNhat.toISOString(),
    het_han_luc: hetHan.toISOString(),
    mui_gio: tuNguonNgoai.meta.timezone,
    hien_tai: tuNguonNgoai.hienTai,
    theo_gio: tuNguonNgoai.theoGio,
    du_bao_ngay: tuNguonNgoai.duBaoNgay,
    du_bao_3_ngay: tuNguonNgoai.duBaoNgay.slice(0, 3),
  };
}

function timDiemGanNhat(times: string[] | undefined, target: string | null | undefined) {
  if (!times?.length || !target) return 0;
  const targetMs = new Date(target).getTime();
  if (!Number.isFinite(targetMs)) return 0;

  let bestIndex = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  times.forEach((time, index) => {
    const distance = Math.abs(new Date(time).getTime() - targetMs);
    if (Number.isFinite(distance) && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function docTheoGio(data: OpenMeteoResponse): DiemThoiTietTheoGio[] {
  const hourly = data?.hourly ?? {};
  const times: string[] = Array.isArray(hourly.time) ? hourly.time : [];

  return times.slice(0, HOURLY_FORECAST_HOURS).map((time, index) => {
    const visibilityM = soHoacNull(hourly.visibility?.[index]);
    return {
      thoi_gian: time,
      nhiet_do_c: soHoacNull(hourly.temperature_2m?.[index]),
      do_am_pct: soHoacNull(hourly.relative_humidity_2m?.[index]),
      diem_suong_c: soHoacNull(hourly.dew_point_2m?.[index]),
      xac_suat_mua_pct: soHoacNull(hourly.precipitation_probability?.[index]),
      luong_mua_mm: soHoacNull(hourly.precipitation?.[index]),
      ap_suat_hpa: soHoacNull(hourly.pressure_msl?.[index]),
      gio_km_h: soHoacNull(hourly.wind_speed_10m?.[index]),
      huong_gio_do: soHoacNull(hourly.wind_direction_10m?.[index]),
      gio_giat_km_h: soHoacNull(hourly.wind_gusts_10m?.[index]),
      tam_nhin_km: visibilityM === null ? null : Number((visibilityM / 1000).toFixed(1)),
      uv: soHoacNull(hourly.uv_index?.[index]),
      may_pct: soHoacNull(hourly.cloud_cover?.[index]),
      ma_thoi_tiet: soHoacNull(hourly.weather_code?.[index]),
    };
  });
}

function docDuBaoNgay(data: OpenMeteoResponse): DuBaoNgay[] {
  const daily = data?.daily ?? {};
  const times: string[] = Array.isArray(daily.time) ? daily.time : [];

  return times.slice(0, FORECAST_DAYS).map((ngay, index) => {
    const ma = soHoacNull(daily.weather_code?.[index]);
    return {
      ngay,
      ma_thoi_tiet: ma,
      mo_ta: moTaMaThoiTiet(ma),
      nhiet_do_cao_nhat_c: soHoacNull(daily.temperature_2m_max?.[index]),
      nhiet_do_thap_nhat_c: soHoacNull(daily.temperature_2m_min?.[index]),
      mua_mm: soHoacNull(daily.precipitation_sum?.[index]),
      xac_suat_mua_cao_nhat_pct: soHoacNull(daily.precipitation_probability_max?.[index]),
      uv_cao_nhat: soHoacNull(daily.uv_index_max?.[index]),
      gio_cao_nhat_km_h: soHoacNull(daily.wind_speed_10m_max?.[index]),
      huong_gio_chu_dao_do: soHoacNull(daily.wind_direction_10m_dominant?.[index]),
      binh_minh: daily.sunrise?.[index] ?? null,
      hoang_hon: daily.sunset?.[index] ?? null,
    };
  });
}

async function goiNguonNgoai(viDo: number, kinhDo: number) {
  const params = new URLSearchParams({
    latitude: String(viDo),
    longitude: String(kinhDo),
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "precipitation",
      "rain",
      "weather_code",
      "cloud_cover",
      "pressure_msl",
      "surface_pressure",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
    ].join(","),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "dew_point_2m",
      "precipitation_probability",
      "precipitation",
      "rain",
      "weather_code",
      "pressure_msl",
      "cloud_cover",
      "visibility",
      "wind_speed_10m",
      "wind_direction_10m",
      "wind_gusts_10m",
      "uv_index",
    ].join(","),
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "precipitation_probability_max",
      "uv_index_max",
      "wind_speed_10m_max",
      "wind_direction_10m_dominant",
      "sunrise",
      "sunset",
    ].join(","),
  });

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Nguon thoi tiet loi: ${res.status}`);
  const data = (await res.json()) as OpenMeteoResponse;

  const theoGio = docTheoGio(data);
  const duBaoNgay = docDuBaoNgay(data);
  const nearestHourly = theoGio[timDiemGanNhat(data?.hourly?.time, data?.current?.time)] ?? theoGio[0];
  const maThoiTiet = soHoacNull(data?.current?.weather_code);

  const hienTai = {
    nhiet_do_c: soHoacNull(data?.current?.temperature_2m),
    cam_giac_c: soHoacNull(data?.current?.apparent_temperature),
    do_am_pct: soHoacNull(data?.current?.relative_humidity_2m),
    diem_suong_c: nearestHourly?.diem_suong_c ?? null,
    luong_mua_mm: soHoacNull(data?.current?.precipitation),
    ap_suat_hpa: soHoacNull(data?.current?.pressure_msl),
    gio_km_h: soHoacNull(data?.current?.wind_speed_10m),
    huong_gio_do: soHoacNull(data?.current?.wind_direction_10m),
    gio_giat_km_h: soHoacNull(data?.current?.wind_gusts_10m),
    tam_nhin_km: nearestHourly?.tam_nhin_km ?? null,
    uv: nearestHourly?.uv ?? null,
    may_pct: soHoacNull(data?.current?.cloud_cover),
    ma_thoi_tiet: maThoiTiet,
    mo_ta: moTaMaThoiTiet(maThoiTiet),
    thoi_gian: data?.current?.time ?? null,
  };

  return {
    hienTai,
    theoGio,
    duBaoNgay,
    meta: { timezone: data?.timezone ?? null },
    nguon: "Open-Meteo Forecast API",
  };
}

export async function layDuLieuThoiTietToiUu(
  viDoRaw: number,
  kinhDoRaw: number,
  batBuocLamMoi = false
): Promise<DuLieuThoiTiet> {
  const viDo = lamTronToaDo(viDoRaw);
  const kinhDo = lamTronToaDo(kinhDoRaw);
  const viTriMa = taoViTriMa(viDo, kinhDo);

  let boQuaCacheDb = false;
  let row: WeatherCacheRow | undefined;

  try {
    await taoBangNeuChuaCo();
    const rs = await db.query(
      `select * from du_lieu.thoi_tiet_bo_nho_dem where vi_tri_ma = $1 limit 1`,
      [viTriMa]
    );
    row = rs.rows[0] as WeatherCacheRow | undefined;
  } catch (error) {
    boQuaCacheDb = true;
    // eslint-disable-next-line no-console
    console.warn(`[${CACHE_DB_UNAVAILABLE}]`, error);
  }

  if (!batBuocLamMoi && row && new Date(row.het_han_luc).getTime() > Date.now()) {
    const duBaoNgay = Array.isArray(row.du_lieu_du_bao) ? row.du_lieu_du_bao : [];
    return {
      vi_do: Number(row.vi_do),
      kinh_do: Number(row.kinh_do),
      nguon_du_lieu: row.nguon_du_lieu,
      thu_vien_bieu_do: "recharts",
      cap_nhat_luc: new Date(row.cap_nhat_luc).toISOString(),
      het_han_luc: new Date(row.het_han_luc).toISOString(),
      mui_gio: row.du_lieu_meta?.timezone ?? null,
      hien_tai: row.du_lieu_hien_tai,
      theo_gio: Array.isArray(row.du_lieu_theo_gio) ? row.du_lieu_theo_gio : [],
      du_bao_ngay: duBaoNgay,
      du_bao_3_ngay: duBaoNgay.slice(0, 3),
    };
  }

  const tuNguonNgoai = await goiNguonNgoai(viDo, kinhDo);
  const capNhat = new Date();
  const hetHan = new Date(capNhat.getTime() + THOI_GIAN_CACHE_PHUT * 60 * 1000);

  if (boQuaCacheDb) {
    return taoKetQuaKhongCache(viDo, kinhDo, tuNguonNgoai, capNhat);
  }

  try {
    await db.query(
      `insert into du_lieu.thoi_tiet_bo_nho_dem(
         vi_tri_ma, vi_do, kinh_do, du_lieu_hien_tai, du_lieu_du_bao, du_lieu_theo_gio,
         du_lieu_meta, nguon_du_lieu, cap_nhat_luc, het_han_luc, updated_at
       )
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       on conflict(vi_tri_ma) do update set
        vi_do=excluded.vi_do,
        kinh_do=excluded.kinh_do,
        du_lieu_hien_tai=excluded.du_lieu_hien_tai,
        du_lieu_du_bao=excluded.du_lieu_du_bao,
        du_lieu_theo_gio=excluded.du_lieu_theo_gio,
        du_lieu_meta=excluded.du_lieu_meta,
        nguon_du_lieu=excluded.nguon_du_lieu,
        cap_nhat_luc=excluded.cap_nhat_luc,
        het_han_luc=excluded.het_han_luc,
        updated_at=now()`,
      [
        viTriMa,
        viDo,
        kinhDo,
        tuNguonNgoai.hienTai,
        tuNguonNgoai.duBaoNgay,
        tuNguonNgoai.theoGio,
        tuNguonNgoai.meta,
        tuNguonNgoai.nguon,
        capNhat.toISOString(),
        hetHan.toISOString(),
      ]
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn(`[${CACHE_DB_UNAVAILABLE}]`, error);
    return taoKetQuaKhongCache(viDo, kinhDo, tuNguonNgoai, capNhat);
  }

  return {
    vi_do: viDo,
    kinh_do: kinhDo,
    nguon_du_lieu: tuNguonNgoai.nguon,
    thu_vien_bieu_do: "recharts",
    cap_nhat_luc: capNhat.toISOString(),
    het_han_luc: hetHan.toISOString(),
    mui_gio: tuNguonNgoai.meta.timezone,
    hien_tai: tuNguonNgoai.hienTai,
    theo_gio: tuNguonNgoai.theoGio,
    du_bao_ngay: tuNguonNgoai.duBaoNgay,
    du_bao_3_ngay: tuNguonNgoai.duBaoNgay.slice(0, 3),
  };
}
