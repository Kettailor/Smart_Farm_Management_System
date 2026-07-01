"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import CowLoading from "@/components/cow-loading";
import ZoneActionMenu from "@/components/dashboard-zone-actions";
import MapViewSwitcher from "@/components/dashboard-map-view-switcher";
import type { ToolbarAction } from "@/components/dashboard-map-tool-icons";
import { withBasePath } from "@/lib/app-path";
import { WAREHOUSE_TYPE_OPTIONS, isWarehouseType, type WarehouseType } from "@/lib/warehouse-types";
import styles from "./page.module.css";
import type { ZoneDetail } from "@/lib/dashboard-zone-detail";
import { ZONE_TYPE_FORM_CONFIGS, ZONE_TYPE_INFO, ZONE_TYPE_OPTIONS, type ZoneTypeKey } from "@/lib/zone-type-utils";

type Props = {
  zone: ZoneDetail;
  vegetation: unknown;
};

type Point = { lat: number; lng: number };

const ZONE_STATES = ["đang hoạt động", "bản nháp", "ngừng hoạt động", "bảo trì", "đã ngừng", "dự kiến", "hoàn thành", "đã hủy"] as const;
const MAP_TYPES = ["vệ tinh", "đường", "địa hình"] as const;
type ZoneStateValue = (typeof ZONE_STATES)[number];

const isValidLatLng = (lat: string, lng: string) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  return Number.isFinite(latitude) && Number.isFinite(longitude) && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
};

const calcAreaHa = (points: Point[]) => {
  if (points.length < 3) return 0;
  const avgLat = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  const projected = points.map((point) => ({ x: point.lng * mPerDegLng, y: point.lat * mPerDegLat }));
  let area = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const nextIndex = (index + 1) % projected.length;
    area += projected[index].x * projected[nextIndex].y - projected[nextIndex].x * projected[index].y;
  }
  return Math.abs(area / 2) / 10000;
};

const calcPerimeterM = (points: Point[]) => {
  if (points.length < 2) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusM = 6371000;
  const distance = (a: Point, b: Point) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusM * Math.asin(Math.sqrt(h));
  };
  return points.reduce((sum, point, index) => sum + distance(point, points[(index + 1) % points.length]), 0);
};

const centroid = (points: Point[]) => {
  if (!points.length) return null;
  const sum = points.reduce((acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
};

function zoneStatusValueFromKey(status: string): ZoneStateValue {
  if (status === "inactive") return "ngừng hoạt động";
  if (status === "maintenance") return "bảo trì";
  if (status === "planned") return "dự kiến";
  if (status === "cancelled") return "đã hủy";
  return "đang hoạt động";
}

export default function EditZoneClient({ zone }: Props) {
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const [zoneTypeKey, setZoneTypeKey] = useState<ZoneTypeKey>(zone.typeKey);
  const typeFields = ZONE_TYPE_FORM_CONFIGS[zoneTypeKey].fields;
  const [typeSpecific, setTypeSpecific] = useState<Record<string, string>>(zone.typeSpecific);
  const [warehouseTypes, setWarehouseTypes] = useState<WarehouseType[]>(zone.warehouseTypes.filter(isWarehouseType));
  const [activeTool, setActiveTool] = useState<ToolbarAction | null>(null);
  const [form, setForm] = useState({
    name: zone.name,
    status: zoneStatusValueFromKey(zone.status),
    description: zone.description,
    color: zone.colorHex,
    latitude: String(zone.center.lat),
    longitude: String(zone.center.lng),
    areaHa: zone.areaHa ? String(zone.areaHa) : "",
    perimeterM: zone.perimeterM ? String(zone.perimeterM) : "",
    capacity: zone.capacity,
    mapType: "vệ tinh",
    zoomLevel: "17",
  });

  const [points, setPoints] = useState<Point[]>(zone.polygon);
  const areaHa = useMemo(() => calcAreaHa(points), [points]);
  const perimeterM = useMemo(() => calcPerimeterM(points), [points]);
  const nextAreaHa = areaHa > 0 ? areaHa.toFixed(4) : form.areaHa;
  const nextPerimeterM = perimeterM > 0 ? perimeterM.toFixed(2) : form.perimeterM;
  const canSave = form.name.trim().length > 0 && points.length >= 3 && isValidLatLng(form.latitude, form.longitude) && (zoneTypeKey !== "storage" || warehouseTypes.length > 0);
  const mapLatitude = Number.isFinite(Number(form.latitude)) ? Number(form.latitude) : zone.center.lat;
  const mapLongitude = Number.isFinite(Number(form.longitude)) ? Number(form.longitude) : zone.center.lng;
  const toggleWarehouseType = (type: WarehouseType) => {
    setWarehouseTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]);
  };

  const applyPoints = useCallback((nextPoints: Point[]) => {
    setPoints(nextPoints);
    const nextCenter = centroid(nextPoints);
    if (!nextCenter) return;
    setForm((current) => ({
      ...current,
      latitude: nextCenter.lat.toFixed(6),
      longitude: nextCenter.lng.toFixed(6),
    }));
  }, []);

  const onMapClick = useCallback((point: Point) => {
    if (activeTool !== "add") return;
    applyPoints([...points, point]);
  }, [activeTool, applyPoints, points]);

  const onToolbarAction = useCallback((action: ToolbarAction) => {
    if (action === "add") {
      setActiveTool((current) => (current === "add" ? null : "add"));
      return;
    }
    if (action === "undo") applyPoints(points.slice(0, -1));
    if (action === "clear") applyPoints([]);
  }, [applyPoints, points]);

  const onResetPolygon = useCallback(() => {
    setActiveTool(null);
    setPoints(zone.polygon);
    setForm((current) => ({
      ...current,
      latitude: String(zone.center.lat),
      longitude: String(zone.center.lng),
      areaHa: zone.areaHa ? String(zone.areaHa) : "",
      perimeterM: zone.perimeterM ? String(zone.perimeterM) : "",
    }));
  }, [zone.areaHa, zone.center.lat, zone.center.lng, zone.perimeterM, zone.polygon]);

  const mapPreview = useMemo(
    () => (
      <MapViewSwitcher
        lat={mapLatitude}
        lng={mapLongitude}
        zoom={Number(form.zoomLevel) || 17}
        title={zone.name}
        initialMode={form.mapType === "vệ tinh" ? "satellite" : form.mapType === "đường" ? "roadmap" : "terrain"}
        frameClassName={styles.mapCanvas}
        polygon={points}
        fitToPolygon={points.length >= 3}
        hideModeTabs={false}
        hideEcoNote
        lockMap={false}
        showToolbar
        toolbarAboveMap
        activeTool={activeTool}
        onToolbarAction={onToolbarAction}
        onMapClick={onMapClick}
      />
    ),
    [activeTool, form.mapType, form.zoomLevel, mapLatitude, mapLongitude, onMapClick, onToolbarAction, points, zone.name]
  );

  const onSave = async () => {
    if (savingRef.current || loading) return;
    if (!canSave) return setError("Vui lòng nhập đầy đủ thông tin bắt buộc.");
    savingRef.current = true;
    setLoading(true);
    setError("");
    try {
      const nextWarehouseTypes = zoneTypeKey === "storage" ? warehouseTypes : [];
      const capacityValue = typeSpecific.capacity ?? typeSpecific.herdCapacity ?? form.capacity;
      const before = {
        name: zone.name,
        status: zone.statusLabel,
        description: zone.description,
        color: zone.colorHex,
        areaHa: zone.areaHa,
        perimeterM: zone.perimeterM,
        capacity: zone.capacity,
        typeSpecific: zone.typeSpecific,
        zoneTypeKey: zone.typeKey,
        latitude: zone.center.lat,
        longitude: zone.center.lng,
        polygon: zone.polygon,
      };
      const after = {
        name: form.name,
        status: form.status,
        description: form.description,
        color: form.color,
        areaHa: nextAreaHa,
        perimeterM: nextPerimeterM,
        capacity: capacityValue,
        typeSpecific: { ...typeSpecific, zoneTypeKey, warehouseTypes: nextWarehouseTypes },
        zoneTypeKey,
        latitude: form.latitude,
        longitude: form.longitude,
        polygon: points,
      };

      const response = await fetch(`/api/dashboard/khu-vuc/${zone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          status: form.status,
          description: form.description,
          color: form.color,
          points,
          areaHa: nextAreaHa,
          perimeterM: nextPerimeterM,
          latitude: form.latitude,
          longitude: form.longitude,
          capacity: capacityValue,
          typeSpecific: {
            ...typeSpecific,
            zoneTypeKey,
            warehouseTypes: nextWarehouseTypes,
          },
          before,
          after,
        }),
      });
      const payload = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(payload.message || "Không thể lưu khu vực.");
      window.dispatchEvent(new Event("farm:navigation-loading"));
      window.location.href = withBasePath(`/dashboard/khu-vuc/${zone.id}`);
    } catch (err) {
      savingRef.current = false;
      setLoading(false);
      setError(err instanceof Error ? err.message : "Không thể lưu khu vực.");
    }
  };

  return (
    <section className={styles.overlay} aria-label="Chỉnh sửa khu vực">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.kicker}>Chỉnh sửa khu vực</span>
          <h1>{zone.name}</h1>
        </div>
        <ZoneActionMenu context="edit" zoneId={zone.id} zoneStatus={zone.status} backHref={`/dashboard/khu-vuc/${zone.id}`} canWrite />
      </header>

      <div className={styles.body}>
        {error && <p className={styles.errorText}>{error}</p>}

        <div className={styles.editLayout}>
          <section className={`${styles.panelCard} ${styles.mapEditorCard}`}>
            <div className={styles.panelTitle}>
              <div>
                <h3>Ranh giới khu vực</h3>
                <p>{activeTool === "add" ? "Đang thêm điểm polygon" : "Bản đồ chỉnh sửa"}</p>
              </div>
              <div className={styles.panelActions}>
                <button type="button" className={styles.smallButton} onClick={onResetPolygon} disabled={loading}>
                  Khôi phục
                </button>
                <span className={styles.badge}>{points.length} điểm</span>
              </div>
            </div>

            <div className={styles.mapMetrics}>
              <div className={styles.metricTile}><span>Diện tích</span><strong>{areaHa > 0 ? `${areaHa.toFixed(2)} ha` : "Chưa đủ điểm"}</strong></div>
              <div className={styles.metricTile}><span>Chu vi</span><strong>{perimeterM > 0 ? `${perimeterM.toFixed(0)} m` : "Chưa đủ điểm"}</strong></div>
              <div className={styles.metricTile}><span>Tâm khu vực</span><strong>{mapLatitude.toFixed(5)}, {mapLongitude.toFixed(5)}</strong></div>
              <div className={styles.metricTile}><span>Ranh giới</span><strong>{points.length >= 3 ? "Hợp lệ" : "Cần 3 điểm"}</strong></div>
            </div>

            <div className={styles.mapBox}>{mapPreview}</div>
          </section>

          <div className={styles.formSection}>
            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeaderSmall}>
                <h3>Thông tin chính</h3>
              </div>
              <div className={styles.formGrid}>
                <div className={styles.field}>
                  <label htmlFor="zone-name">Tên khu vực</label>
                  <input id="zone-name" className={styles.input} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </div>
                <div className={styles.twoCols}>
                  <div className={styles.field}>
                    <label htmlFor="zone-status">Trạng thái</label>
                    <select id="zone-status" className={styles.select} value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as ZoneStateValue }))}>
                      {ZONE_STATES.map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="zone-type">Loại khu vực</label>
                    <select id="zone-type" className={styles.select} value={zoneTypeKey} onChange={(e) => setZoneTypeKey(e.target.value as ZoneTypeKey)}>
                      {ZONE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className={styles.field}>
                  <label htmlFor="zone-description">Mô tả</label>
                  <textarea id="zone-description" className={styles.textarea} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
                </div>
                <div className={styles.colorRow}>
                  <div className={styles.field}>
                    <label htmlFor="zone-color">Màu hiển thị</label>
                    <div className={styles.colorInputRow}>
                      <input id="zone-color" className={styles.input} value={form.color} onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))} />
                      <span className={styles.colorPill} style={{ backgroundColor: form.color }} aria-hidden="true" />
                    </div>
                  </div>
                  <div className={styles.colorSwatches} aria-label="Màu gợi ý">
                    {['#1f7a4a', '#2ca25f', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'].map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={styles.colorSwatch}
                        style={{ backgroundColor: color }}
                        onClick={() => setForm((p) => ({ ...p, color }))}
                        aria-label={`Chọn màu ${color}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.sectionBlock}>
              <div className={styles.sectionHeaderSmall}>
                <h3>Tọa độ và nền bản đồ</h3>
              </div>
              <div className={styles.formGrid}>
                <div className={styles.twoCols}>
                  <div className={styles.field}>
                    <label htmlFor="zone-latitude">Vĩ độ</label>
                    <input id="zone-latitude" className={styles.input} value={form.latitude} onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))} />
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="zone-longitude">Kinh độ</label>
                    <input id="zone-longitude" className={styles.input} value={form.longitude} onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))} />
                  </div>
                </div>
                <div className={styles.twoCols}>
                  <div className={styles.field}>
                    <label htmlFor="zone-map-type">Loại bản đồ</label>
                    <select id="zone-map-type" className={styles.select} value={form.mapType} onChange={(e) => setForm((p) => ({ ...p, mapType: e.target.value }))}>
                      {MAP_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label htmlFor="zone-zoom">Mức thu phóng</label>
                    <select id="zone-zoom" className={styles.select} value={form.zoomLevel} onChange={(e) => setForm((p) => ({ ...p, zoomLevel: e.target.value }))}>
                      {Array.from({ length: 12 }, (_, i) => 10 + i).map((level) => (
                        <option key={level} value={String(level)}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <section className={styles.sectionBlock}>
          <div className={styles.sectionHeaderSmall}>
            <h3>{ZONE_TYPE_INFO[zoneTypeKey].detailTitle}</h3>
          </div>
          <div className={styles.formGrid}>
            <div className={styles.typeFieldGrid}>
              {typeFields.map((field) => (
                <div key={field.key} className={styles.field}>
                  <label htmlFor={`zone-type-${field.key}`}>{field.label}</label>
                  <input
                    id={`zone-type-${field.key}`}
                    className={styles.input}
                    type={field.type ?? "text"}
                    step={field.step}
                    value={typeSpecific[field.key] ?? ""}
                    onChange={(e) => setTypeSpecific((current) => ({ ...current, [field.key]: e.target.value }))}
                    placeholder={field.placeholder}
                  />
                </div>
              ))}
            </div>
            {zoneTypeKey === "storage" && (
              <div className={styles.field}>
                <label>Nhóm lưu trữ trong kho</label>
                <div className={styles.warehouseTypeChecklist}>
                  {WAREHOUSE_TYPE_OPTIONS.map((option) => (
                    <label key={option.value} className={styles.warehouseTypeOption}>
                      <input
                        type="checkbox"
                        checked={warehouseTypes.includes(option.value)}
                        onChange={() => toggleWarehouseType(option.value)}
                      />
                      <span>
                        <strong>{option.shortLabel}</strong>
                        <small>{option.purpose}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {(zoneTypeKey === "grazing" || zoneTypeKey === "livestock") && (
              <div className={styles.typeHint}>
                <strong>Số liệu liên quan</strong>
                <span>
                  Hiện có {zone.metrics.livestockCount} vật nuôi và {zone.metrics.noteCount} ghi chú liên quan.
                </span>
              </div>
            )}
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <div className={styles.buttonBar}>
          <Link
            href={`/dashboard/khu-vuc/${zone.id}`}
            className={styles.secondary}
            aria-disabled={loading}
            onClick={(event) => {
              if (loading) event.preventDefault();
            }}
          >
            Hủy
          </Link>
          <button type="button" className={styles.primary} onClick={onSave} disabled={!canSave || loading}>
            {loading ? <CowLoading label="Đang tải..." /> : "Lưu thay đổi"}
          </button>
        </div>
      </footer>
      {loading && (
        <div className={styles.savingOverlay} aria-live="polite" aria-label="Đang lưu thay đổi khu vực">
          <CowLoading label="Đang lưu thay đổi..." />
        </div>
      )}
    </section>
  );
}
