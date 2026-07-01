"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import CowLoading from "@/components/cow-loading";
import MapViewSwitcher from "@/components/dashboard-map-view-switcher";
import ZoneActionMenu from "@/components/dashboard-zone-actions";
import type { ToolbarAction } from "@/components/dashboard-map-tool-icons";
import { withBasePath } from "@/lib/app-path";
import { WAREHOUSE_TYPE_OPTIONS, type WarehouseType } from "@/lib/warehouse-types";
import { ZONE_TYPE_FORM_CONFIGS, ZONE_TYPE_OPTIONS, type ZoneTypeKey } from "@/lib/zone-type-utils";
import styles from "./zone-create-wizard.module.css";

type InitialLocation = {
  farmName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  locationName?: string | null;
};

type ZoneState = "đang hoạt động" | "bản nháp" | "ngừng hoạt động" | "bảo trì" | "đã ngừng" | "dự kiến" | "hoàn thành" | "đã hủy";
type MapType = "vệ tinh" | "đường" | "địa hình";

type Props = {
  ownerId: string;
  initialLocation: InitialLocation | null;
};

type Point = { lat: number; lng: number };

const ZONE_STATES: Array<{ value: ZoneState; label: string }> = [
  { value: "đang hoạt động", label: "Đang hoạt động" },
  { value: "bản nháp", label: "Bản nháp" },
  { value: "dự kiến", label: "Dự kiến" },
  { value: "hoàn thành", label: "Hoàn thành" },
  { value: "bảo trì", label: "Bảo trì" },
  { value: "ngừng hoạt động", label: "Ngừng hoạt động" },
  { value: "đã ngừng", label: "Đã ngừng" },
  { value: "đã hủy", label: "Đã hủy" },
];

const MAP_TYPES: Array<{ value: MapType; label: string }> = [
  { value: "vệ tinh", label: "Bản đồ vệ tinh" },
  { value: "đường", label: "Bản đồ đường" },
  { value: "địa hình", label: "Bản đồ địa hình" },
];

const COLORS = ["#1f7a4a", "#f43f5e", "#ef4444", "#d946ef", "#8b5cf6", "#3b82f6", "#0ea5e9", "#14b8a6", "#84cc16", "#eab308", "#f97316", "#b45309", "#6b7280"];

const calcAreaHa = (points: Point[]) => {
  if (points.length < 3) return 0;
  const avgLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const mPerDegLat = 111320;
  const mPerDegLng = 111320 * Math.cos((avgLat * Math.PI) / 180);
  const pts = points.map((p) => ({ x: p.lng * mPerDegLng, y: p.lat * mPerDegLat }));
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2) / 10000;
};

const calcPerimeterM = (points: Point[]) => {
  if (points.length < 2) return 0;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dist = (a: Point, b: Point) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };
  return points.reduce((sum, point, index) => sum + dist(point, points[(index + 1) % points.length]), 0);
};

export default function ZoneCreateWizard({ initialLocation }: Props) {
  const [step, setStep] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const savingRef = useRef(false);
  const [points, setPoints] = useState<Point[]>([]);
  const [activeTool, setActiveTool] = useState<ToolbarAction | null>(null);
  const [form, setForm] = useState({
    name: "",
    state: "đang hoạt động" as ZoneState,
    kind: "cropping" as ZoneTypeKey,
    description: "",
    latitude: String(initialLocation?.latitude ?? 10.762622),
    longitude: String(initialLocation?.longitude ?? 106.660172),
    locationName: initialLocation?.locationName ?? initialLocation?.farmName ?? "",
    daysEmpty: "",
    dseLoad: "",
    stockingRate: "",
    feedOnOffer: "",
    grazingDaysRemaining: "",
    pastureGrowthRate: "",
    pastureType: "",
    pastureState: "",
    cropType: "",
    cropVariety: "",
    plantingStage: "",
    soilPh: "",
    soilMoisture: "",
    irrigationMethod: "",
    sunHours: "",
    livestockType: "",
    herdCapacity: "",
    housingType: "",
    biosecurityLevel: "",
    feedPlan: "",
    wastePlan: "",
    waterSourceType: "",
    waterQuality: "",
    waterLevel: "",
    usagePurpose: "",
    warehouseTypes: [] as WarehouseType[],
    capacity: "",
    temperature: "",
    humidityTarget: "",
    storageCondition: "",
    parkingType: "",
    surface: "",
    accessRoute: "",
    maintenanceNote: "",
    notes: "",
    preferredColor: "#1f7a4a",
    mapType: "vệ tinh" as MapType,
    zoomLevel: "15",
  });

  const kindConfig = ZONE_TYPE_FORM_CONFIGS[form.kind];
  const kindFields = kindConfig.fields;
  const areaHa = calcAreaHa(points);
  const perimeterM = calcPerimeterM(points);
  const hasWarehouseTypeSelection = form.kind !== "storage" || form.warehouseTypes.length > 0;
  const canSave = form.name.trim().length > 0 && points.length >= 3 && hasWarehouseTypeSelection;

  const onMapClick = useCallback((p: Point) => {
    if (activeTool !== "add") return;
    setPoints((prev) => [...prev, p]);
  }, [activeTool]);

  const onToolbarAction = useCallback((action: ToolbarAction) => {
    if (action === "add") {
      setActiveTool((prev) => (prev === "add" ? null : "add"));
      return;
    }
    if (action === "undo") setPoints((prev) => prev.slice(0, -1));
    if (action === "clear") setPoints([]);
  }, []);

  const toggleWarehouseType = (type: WarehouseType) => {
    setForm((current) => {
      const exists = current.warehouseTypes.includes(type);
      return {
        ...current,
        warehouseTypes: exists
          ? current.warehouseTypes.filter((item) => item !== type)
          : [...current.warehouseTypes, type],
      };
    });
  };

  const mapPreview = useMemo(() => (
    <MapViewSwitcher
      lat={Number(form.latitude) || 10.762622}
      lng={Number(form.longitude) || 106.660172}
      zoom={Number(form.zoomLevel) || 15}
      title="Bản đồ khu vực"
      initialMode={form.mapType === "vệ tinh" ? "satellite" : form.mapType === "đường" ? "roadmap" : "terrain"}
      frameClassName="farm-map-canvas"
      polygon={points}
      fitToPolygon={points.length >= 3}
      showToolbar
      toolbarAboveMap
      activeTool={activeTool}
      onToolbarAction={onToolbarAction}
      onMapClick={onMapClick}
    />
  ), [activeTool, form.latitude, form.longitude, form.mapType, form.zoomLevel, onMapClick, onToolbarAction, points]);

  const onNext = () => {
    if (loading) return;
    setError("");
    if (step === 1 && !form.name.trim()) return setError("Vui lòng nhập tên khu vực.");
    if (step === 1 && form.kind === "storage" && form.warehouseTypes.length === 0) return setError("Vui lòng tick ít nhất một nhóm lưu trữ cho khu vực kho.");
    if (step === 2 && points.length < 3) return setError("Vui lòng chọn ít nhất 3 điểm để tạo polygon.");
    setStep((s) => Math.min(5, s + 1));
  };

  const onBack = () => {
    if (loading) return;
    setStep((s) => Math.max(1, s - 1));
  };
  const buildExtraPayload = () => {
    const extra: Record<string, string | WarehouseType[]> = {};
    kindFields.forEach((field) => {
      const value = (form as unknown as Record<string, string>)[field.key];
      if (value?.trim()) extra[field.key] = value.trim();
    });
    if (form.kind === "storage") extra.warehouseTypes = form.warehouseTypes;
    return extra;
  };
  const onSave = async () => {
    if (savingRef.current || loading) return;
    if (!canSave) return setError("Vui lòng nhập đầy đủ thông tin bắt buộc.");
    savingRef.current = true;
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/du-lieu/khu-vuc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: form.name.trim(), status: form.state, kind: form.kind, categoryId: null, description: form.description.trim() || undefined, areaHa: String(areaHa || ""), perimeterM: String(perimeterM || ""), latitude: form.latitude, longitude: form.longitude, color: form.preferredColor, points, extra: buildExtraPayload() }) });
      const data = (await res.json()) as { message?: string; nextPath?: string };
      if (!res.ok) {
        savingRef.current = false;
        setLoading(false);
        return setError(data.message || "Không thể lưu khu vực.");
      }
      window.dispatchEvent(new Event("farm:navigation-loading"));
      window.location.href = withBasePath(data.nextPath || "/dashboard/khu-vuc");
    } catch {
      savingRef.current = false;
      setLoading(false);
      setError("Không thể kết nối máy chủ.");
    }
  };

  const stepTitle = ["Thông tin cơ bản", "Tạo polygon trên bản đồ", kindConfig.title, "Thiết lập bổ sung", "Xác nhận và lưu"][step - 1];
  const stepSubtitle = ["Nhập tên, loại và trạng thái khu vực.", "Bấm vào bản đồ để thêm các điểm tạo thành polygon. Hệ thống sẽ tự tính diện tích và chu vi.", kindConfig.subtitle, "Tùy chỉnh màu sắc, bản đồ và thông số hiển thị.", "Kiểm tra lại toàn bộ dữ liệu trước khi lưu."][step - 1];

  return (
    <section className={styles.overlay} aria-label="Tạo khu vực mới">
      <header className={styles.header}>
        <div>
          <p className={styles.kicker}>Quản lý khu vực</p>
          <h1>Tạo khu vực mới</h1>
        </div>
        <ZoneActionMenu context="create" backHref="/dashboard/khu-vuc" canWrite />
      </header>
      <div className={styles.body}>
        <div className={styles.stepHead}><div className={styles.stepBadge}>{step} / 5</div><div className={styles.stepMeta}><h2>{stepTitle}</h2><p>{stepSubtitle}</p></div></div>
        {step === 1 && <div className={styles.formGrid}><div className={styles.field}><label>Tên khu vực <small>*</small></label><input className={styles.input} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Nhập tên khu vực" /></div><div className={styles.twoCols}><div className={styles.field}><label>Trạng thái khu vực <small>*</small></label><select className={styles.select} value={form.state} onChange={(e) => setForm((p) => ({ ...p, state: e.target.value as ZoneState }))}>{ZONE_STATES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className={styles.field}><label>Loại khu vực <small>*</small></label><select className={styles.select} value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as ZoneTypeKey }))}>{ZONE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div><div className={styles.field}><label>Mô tả <small>(không bắt buộc)</small></label><textarea className={styles.textarea} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Mô tả thêm về khu vực" /></div></div>}
        {step === 1 && form.kind === "storage" && (
          <div className={styles.warehouseTypePanel}>
            <div>
              <h3>Nhóm lưu trữ trong kho</h3>
              <p>Chỉ cần tick các nhóm vật tư được phép đặt trong kho này.</p>
            </div>
            <div className={styles.warehouseTypeChecklist}>
              {WAREHOUSE_TYPE_OPTIONS.map((option) => (
                <label key={option.value} className={styles.warehouseTypeOption}>
                  <input
                    type="checkbox"
                    checked={form.warehouseTypes.includes(option.value)}
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
        {step === 2 && <div className={styles.formGrid}><div className={styles.summaryCard}><h3>Hướng dẫn vẽ polygon</h3><div className={styles.summaryItem}><span>Cách dùng:</span><strong>Bật nút Thêm điểm ở thanh công cụ trong bản đồ rồi bấm lên bản đồ để tạo các đỉnh polygon.</strong></div><div className={styles.summaryItem}><span>Số điểm hiện tại:</span><strong>{points.length}</strong></div><div className={styles.summaryItem}><span>Diện tích:</span><strong>{areaHa > 0 ? `${areaHa.toFixed(2)} ha` : "—"}</strong></div><div className={styles.summaryItem}><span>Chu vi:</span><strong>{perimeterM > 0 ? `${perimeterM.toFixed(0)} m` : "—"}</strong></div></div><div className={styles.field}><label>Địa điểm</label><input className={styles.input} value={form.locationName} onChange={(e) => setForm((p) => ({ ...p, locationName: e.target.value }))} placeholder="Tên địa điểm" /></div><div className={styles.twoCols}><div className={styles.field}><label>Vĩ độ trung tâm</label><input className={styles.input} value={form.latitude} onChange={(e) => setForm((p) => ({ ...p, latitude: e.target.value }))} /></div><div className={styles.field}><label>Kinh độ trung tâm</label><input className={styles.input} value={form.longitude} onChange={(e) => setForm((p) => ({ ...p, longitude: e.target.value }))} /></div></div><div className={styles.mapBox}>{mapPreview}</div></div>}
        {step === 3 && <div className={styles.formGrid}><div className={styles.twoCols}>{kindFields.map((field) => <div key={field.key} className={styles.field}><label>{field.label}</label><input className={styles.input} type={field.type ?? "text"} step={field.step} placeholder={field.placeholder} value={(form as unknown as Record<string, string>)[field.key]} onChange={(e) => setForm((p) => ({ ...p, [field.key]: e.target.value }))} /></div>)}</div></div>}
        {step === 4 && <div className={styles.formGrid}><div className={styles.field}><label>Màu hiển thị <small>(không bắt buộc)</small></label><div className={styles.colorRow}>{COLORS.map((color) => <button key={color} type="button" className={styles.colorSwatch} style={{ background: color, outline: form.preferredColor === color ? "2px solid #0f172a" : "none" }} onClick={() => setForm((p) => ({ ...p, preferredColor: color }))} aria-label={`Chọn màu ${color}`} />)}</div></div><div className={styles.twoCols}><div className={styles.field}><label>Loại bản đồ</label><select className={styles.select} value={form.mapType} onChange={(e) => setForm((p) => ({ ...p, mapType: e.target.value as MapType }))}>{MAP_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div><div className={styles.field}><label>Mức thu phóng</label><select className={styles.select} value={form.zoomLevel} onChange={(e) => setForm((p) => ({ ...p, zoomLevel: e.target.value }))}>{Array.from({ length: 12 }, (_, i) => 10 + i).map((level) => <option key={level} value={String(level)}>{level}</option>)}</select></div></div></div>}
        {step === 5 && <div className={styles.summary}><div className={styles.summaryCard}><h3>Thông tin cơ bản</h3><div className={styles.summaryItem}><span>Tên khu vực:</span><strong>{form.name}</strong></div><div className={styles.summaryItem}><span>Trạng thái:</span><strong>{ZONE_STATES.find((s) => s.value === form.state)?.label}</strong></div><div className={styles.summaryItem}><span>Loại khu vực:</span><strong>{ZONE_TYPE_OPTIONS.find((s) => s.value === form.kind)?.label}</strong></div></div><div className={styles.summaryCard}><h3>Polygon & vị trí</h3><div className={styles.summaryItem}><span>Số điểm:</span><strong>{points.length}</strong></div><div className={styles.summaryItem}><span>Diện tích:</span><strong>{areaHa > 0 ? `${areaHa.toFixed(2)} ha` : "—"}</strong></div><div className={styles.summaryItem}><span>Chu vi:</span><strong>{perimeterM > 0 ? `${perimeterM.toFixed(0)} m` : "—"}</strong></div></div><div className={styles.summaryCard}><h3>Dữ liệu theo loại</h3>{kindFields.map((field) => <div key={field.key} className={styles.summaryItem}><span>{field.label}:</span><strong>{(form as unknown as Record<string, string>)[field.key] || "—"}</strong></div>)}</div><div className={styles.summaryCard}><h3>Thiết lập bổ sung</h3><div className={styles.summaryItem}><span>Màu hiển thị:</span><strong>{form.preferredColor}</strong></div><div className={styles.summaryItem}><span>Loại bản đồ:</span><strong>{form.mapType}</strong></div><div className={styles.summaryItem}><span>Mức thu phóng:</span><strong>{form.zoomLevel}</strong></div><div className={styles.summaryItem}><span>Mô tả:</span><strong>{form.description || "—"}</strong></div></div></div>}
        {step === 5 && form.kind === "storage" && (
          <div className={styles.warehouseTypePanel}>
            <div>
              <h3>Nhóm lưu trữ đã tick</h3>
              <p>{form.warehouseTypes.length > 0 ? form.warehouseTypes.map((type) => WAREHOUSE_TYPE_OPTIONS.find((option) => option.value === type)?.shortLabel ?? type).join(", ") : "Chưa chọn nhóm lưu trữ."}</p>
            </div>
          </div>
        )}
        {error && <p style={{ color: "#dc2626", margin: 0 }}>{error}</p>}
      </div>
      <footer className={styles.footer}>
        <div className={styles.footerMeta}>
          <span>Bước {step} / 5</span>
          <strong>{stepTitle}</strong>
        </div>
        <div className={styles.footerActions}>
          <button type="button" className={styles.secondary} onClick={onBack} disabled={step === 1 || loading}>
            Quay lại
          </button>
          {step < 5 ? (
            <button type="button" className={styles.primary} onClick={onNext} disabled={loading}>
              Tiếp tục
            </button>
          ) : (
            <button type="button" className={styles.primary} onClick={onSave} disabled={loading || !canSave}>
              {loading ? <CowLoading label="Đang tải..." /> : "Lưu khu vực"}
            </button>
          )}
        </div>
      </footer>
      {loading && (
        <div className={styles.savingOverlay} aria-live="polite" aria-label="Đang lưu khu vực">
          <CowLoading label="Đang lưu khu vực..." />
        </div>
      )}
    </section>
  );
}
