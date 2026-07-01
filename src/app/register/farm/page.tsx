"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import CowLoading from "@/components/cow-loading";
import { withBasePath } from "@/lib/app-path";

type LastSource = "name" | "link" | "coord" | "current";
type Suggestion = { name: string; lat: string; lng: string };
type StepKey = 1 | 2 | 3 | 4 | 5;
type ReverseAddress = {
  displayName: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};
type NominatimReverseResponse = {
  display_name?: string;
  address?: Record<string, string | undefined>;
};

const STEPS = [
  "Thông tin nông trại",
  "Vị trí nông trại",
  "Nuôi con gì",
  "Thiết lập",
  "Nguồn biết đến hệ thống",
];
const LIVESTOCK = ["Bò", "Trâu", "Dê", "Cừu", "Heo", "Gà", "Vịt", "Cá", "Khác"];
const HEARD = ["Sự kiện", "Báo chí", "Blog hoặc ấn phẩm trực tuyến", "Đề xuất ngang hàng", "Đài phát thanh", "Công cụ tìm kiếm", "Truyền thông xã hội", "Truyền hình", "Biển quảng cáo", "Khác"];
const isCoordValid = (lat: string, lng: string) => /^[-]?[0-9]+\.[0-9]{4,}$/.test(lat) && /^[-]?[0-9]+\.[0-9]{4,}$/.test(lng);
const firstText = (...values: Array<string | undefined>) => values.find((value) => value?.trim())?.trim() ?? "";

function normalizeReverseAddress(data: NominatimReverseResponse): ReverseAddress {
  const address = data.address ?? {};
  const city = firstText(address.city, address.town, address.municipality, address.city_district, address.county, address.state);
  const state = firstText(address.state, address.province, address.region, city);
  const addressLine2 = [address.suburb, address.quarter, address.village, address.hamlet, address.road].map((item) => item?.trim()).filter(Boolean).join(", ");

  return {
    displayName: data.display_name?.trim() ?? "",
    addressLine2,
    city,
    state,
    postalCode: firstText(address.postcode),
    country: firstText(address.country),
  };
}

export default function FarmRegistrationPage() {
  const router = useRouter();
  const [step, setStep] = useState<StepKey>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locationError, setLocationError] = useState("");
  const [resolvingLocation, setResolvingLocation] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const submittingRef = useRef(false);
  const [f, setF] = useState({
    farmName: "",
    farmArea: "10",
    locationName: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    mapsLink: "",
    lat: "10.762622",
    lng: "106.660172",
    lastSource: "coord" as LastSource,
    livestockTypes: [] as string[],
    specialFactors: "",
    annualRainfall: "1000",
    carryingCapacity: "11",
    springStart: "01/09",
    heardFrom: [] as string[],
    heardOther: "",
  });

  const mapEmbed = `https://maps.google.com/maps?q=${encodeURIComponent(`${f.lat},${f.lng}`)}&z=15&output=embed`;
  const hasValidLocation = (!!f.locationName.trim() || /^https?:\/\//i.test(f.mapsLink.trim())) && isCoordValid(f.lat, f.lng);
  const pick = (k: "livestockTypes" | "heardFrom", v: string) => setF((p) => ({ ...p, [k]: p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v] }));

  const resolveAddress = useCallback(async (lat: string, lng: string, fallbackName?: string) => {
    if (!isCoordValid(lat, lng)) return;
    setResolvingLocation(true);
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`);
      if (!response.ok) return;
      const address = normalizeReverseAddress((await response.json()) as NominatimReverseResponse);
      setF((current) => {
        if (current.lat !== lat || current.lng !== lng) return current;
        return {
          ...current,
          locationName: address.displayName || fallbackName || current.locationName,
          addressLine2: address.addressLine2,
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
        };
      });
      setLocationError("");
    } catch {
      setLocationError("Không thể tự động lấy địa chỉ từ tọa độ. Vui lòng kiểm tra lại vị trí.");
    } finally {
      setResolvingLocation(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 2 || f.lastSource !== "name" || f.locationName.trim().length < 2) return setSuggestions([]);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(f.locationName)}`);
        const d = (await r.json()) as Array<{ display_name: string; lat: string; lon: string }>;
        setSuggestions(d.map((x) => ({ name: x.display_name, lat: Number(x.lat).toFixed(6), lng: Number(x.lon).toFixed(6) })));
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [f.locationName, f.lastSource, step]);

  const applyLink = (link: string) => {
    const m = link.match(/@([-0-9.]+),([-0-9.]+)/) || link.match(/[?&]q=([-0-9.]+),([-0-9.]+)/);
    if (!m) return setLocationError("Liên kết Google Maps không hợp lệ.");
    const lat = Number(m[1]).toFixed(6);
    const lng = Number(m[2]).toFixed(6);
    if (!isCoordValid(lat, lng)) return setLocationError("Tọa độ trong liên kết không hợp lệ.");
    const name = decodeURIComponent((link.match(/\/place\/([^/]+)/)?.[1] || "").replace(/\+/g, " "));
    setLocationError("");
    const fallbackName = name || `Google Maps ${lat}, ${lng}`;
    setF((p) => ({ ...p, mapsLink: link, locationName: fallbackName, lat, lng, lastSource: "link" }));
    void resolveAddress(lat, lng, fallbackName);
  };

  const useCurrentLocation = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Trình duyệt không hỗ trợ lấy vị trí hiện tại.");
      return;
    }
    setResolvingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6);
        const lng = position.coords.longitude.toFixed(6);
        const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        const fallbackName = `Vị trí hiện tại ${lat}, ${lng}`;
        setF((p) => ({ ...p, locationName: fallbackName, mapsLink, lat, lng, lastSource: "current" }));
        void resolveAddress(lat, lng, fallbackName);
      },
      () => {
        setResolvingLocation(false);
        setLocationError("Không thể lấy vị trí hiện tại. Vui lòng cho phép truy cập vị trí hoặc nhập tọa độ thủ công.");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  };

  useEffect(() => {
    if (step !== 2 || f.lastSource !== "coord" || !isCoordValid(f.lat, f.lng)) return;
    const timer = setTimeout(() => {
      void resolveAddress(f.lat, f.lng);
    }, 650);
    return () => clearTimeout(timer);
  }, [f.lat, f.lng, f.lastSource, resolveAddress, step]);

  const goNext = () => {
    setError("");
    if (step === 1 && (!f.farmName.trim() || Number(f.farmArea) <= 0)) return setError("Vui lòng nhập tên nông trại và diện tích hợp lệ.");
    if (step === 2 && !hasValidLocation) return setError("Vui lòng nhập vị trí nông trại hợp lệ.");
    if (step === 3 && f.livestockTypes.length === 0) return setError("Vui lòng chọn ít nhất một loại chăn nuôi.");
    if (step === 4 && (!f.annualRainfall.trim() || !f.carryingCapacity.trim() || !f.springStart.trim())) return setError("Vui lòng nhập đầy đủ thiết lập.");
    if (step < 5) setStep((s) => (s + 1) as StepKey);
  };

  const goBack = () => setStep((s) => (s > 1 ? (s - 1) as StepKey : s));

  const onSaveFarm = async () => {
    if (submittingRef.current) return;
    setError("");
    if (!f.farmName.trim()) return setError("Vui lòng nhập tên nông trại.");
    if (!hasValidLocation) return setError("Vui lòng nhập vị trí nông trại hợp lệ.");
    submittingRef.current = true;
    setLoading(true);
    let shouldResetLoading = true;
    try {
      const res = await fetch("/api/register-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm: {
            name: f.farmName.trim(),
            areaHectare: Number(f.farmArea),
            specialFactors: f.specialFactors.trim() || undefined,
          },
          location: {
            locationName: f.locationName.trim() || undefined,
            addressLine2: f.addressLine2.trim() || undefined,
            city: f.city.trim() || undefined,
            state: f.state.trim() || undefined,
            postalCode: f.postalCode.trim() || undefined,
            country: f.country.trim() || undefined,
            mapsLink: f.mapsLink.trim() || undefined,
            lat: f.lat,
            lng: f.lng,
          },
          production: {
            livestock: f.livestockTypes.map((name) => ({ name })),
          },
          settings: {
            annualRainfall: Number(f.annualRainfall),
            carryingCapacity: Number(f.carryingCapacity),
            springStart: f.springStart.trim(),
          },
          referral: {
            channels: f.heardFrom,
            otherNote: f.heardFrom.includes("Khác") ? f.heardOther.trim() || undefined : undefined,
          },
        }),
      });
      const data = (await res.json()) as { message?: string; nextPath?: string };
      if (!res.ok) return setError(data.message || "Không thể lưu thông tin nông trại.");
      shouldResetLoading = false;
      window.dispatchEvent(new Event("farm:navigation-loading"));
      router.push(data.nextPath || "/dashboard");
      router.refresh();
    } catch {
      setError("Không thể kết nối máy chủ.");
    } finally {
      if (shouldResetLoading) {
        submittingRef.current = false;
        setLoading(false);
      }
    }
  };

  const rightCta = step === 5 ? (
    <button type="button" className="btn btn-primary" onClick={onSaveFarm} disabled={loading}>{loading ? <CowLoading label="Đang tải..." /> : "Lưu nông trại"}</button>
  ) : (
    <button type="button" className="btn btn-primary" onClick={goNext} disabled={loading}>Tiếp tục</button>
  );

  const canGoBack = step > 1;

  return (
    <main className="page-shell auth-shell">
      <section className="auth-card card farm-auth-card">
        <aside className="auth-visual auth-visual-register farm-setup-panel">
          <div className="auth-brand-row">
            <Image src={withBasePath("/favicon.ico")} alt="KetKat-EcoFarm" width={46} height={46} className="auth-logo" />
            <div>
              <p className="auth-brand-label">Thiết lập nông trại</p>
              <strong>KetKat-EcoFarm</strong>
            </div>
          </div>

          <h1 className="auth-visual-title">Nhập thông tin khởi tạo nông trại theo từng bước rõ ràng.</h1>
          <p className="auth-visual-text">Điền từng phần để hệ thống lưu cấu hình đầy đủ, mạch lạc và đồng bộ với dashboard.</p>

          <ol className="register-step-list farm-step-list">
            {STEPS.map((s, i) => (
              <li key={s} className={i + 1 === step ? "is-active" : ""}>
                <span>{String(i + 1).padStart(2, "0")}</span>
                <strong>{s}</strong>
              </li>
            ))}
          </ol>
        </aside>

        <div className="auth-panel farm-panel">
          <div className="auth-panel-head">
            <p className="kicker">Khởi tạo farm</p>
            <div className="register-step-badge">Bước {step} / 5</div>
            <h2>Nhập thông tin nông trại</h2>
            <p className="section-subtitle">Điền từng phần để hệ thống lưu cấu hình một cách đầy đủ và chính xác.</p>
          </div>

          <div className="register-grid farm-grid">
            {step === 1 && <>
              <label className="auth-field full">
                <span>Tên nông trại</span>
                <input className="input full" placeholder="Tên nông trại *" value={f.farmName} onChange={(e) => setF({ ...f, farmName: e.target.value })} />
              </label>
              <label className="auth-field full">
                <span>Diện tích (ha)</span>
                <input className="input full" type="number" placeholder="Diện tích (ha) *" value={f.farmArea} onChange={(e) => setF({ ...f, farmArea: e.target.value })} />
              </label>
            </>}

            {step === 2 && <>
              <div className="full">
                <label className="auth-field">
                  <span>Tên vị trí</span>
                  <input className="input" placeholder="Tên vị trí" value={f.locationName} onChange={(e) => { setLocationError(""); setF({ ...f, locationName: e.target.value, lastSource: "name" }); }} />
                </label>
                {suggestions.length > 0 && <div className="card suggestion-list">{suggestions.map((s) => <button key={`${s.lat}-${s.lng}-${s.name}`} type="button" className="btn btn-secondary suggestion-item" onClick={() => { setSuggestions([]); setF((p) => ({ ...p, locationName: s.name, lat: s.lat, lng: s.lng, mapsLink: `https://www.google.com/maps?q=${s.lat},${s.lng}`, lastSource: "name" })); void resolveAddress(s.lat, s.lng, s.name); }}>{s.name}</button>)}</div>}
              </div>
              <label className="auth-field full">
                <span>Liên kết Google Maps</span>
                <input className="input full" placeholder="Liên kết Google Maps" value={f.mapsLink} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, mapsLink: v })); if (/^https?:\/\//i.test(v)) applyLink(v); }} />
              </label>
              <div className="full">
                <button type="button" className="btn btn-secondary" onClick={useCurrentLocation} disabled={resolvingLocation}>
                  {resolvingLocation ? <CowLoading label="Đang lấy vị trí..." /> : "Dùng vị trí hiện tại"}
                </button>
              </div>
              <div className="grid-2 full">
                <label className="auth-field">
                  <span>Vĩ độ</span>
                  <input className="input" placeholder="Vĩ độ" value={f.lat} onChange={(e) => setF({ ...f, lat: e.target.value, lastSource: "coord" })} />
                </label>
                <label className="auth-field">
                  <span>Kinh độ</span>
                  <input className="input" placeholder="Kinh độ" value={f.lng} onChange={(e) => setF({ ...f, lng: e.target.value, lastSource: "coord" })} />
                </label>
              </div>
              <div className="grid-3 full">
                <label className="auth-field">
                  <span>Thành phố</span>
                  <input className="input" value={f.city} readOnly placeholder={resolvingLocation ? "Đang lấy..." : "Tự động"} />
                </label>
                <label className="auth-field">
                  <span>Tỉnh/Thành</span>
                  <input className="input" value={f.state} readOnly placeholder={resolvingLocation ? "Đang lấy..." : "Tự động"} />
                </label>
                <label className="auth-field">
                  <span>Quốc gia</span>
                  <input className="input" value={f.country} readOnly placeholder={resolvingLocation ? "Đang lấy..." : "Tự động"} />
                </label>
              </div>
              <div className="card full"><iframe title="Bản đồ vị trí" src={mapEmbed} loading="lazy" className="register-map" /></div>
            </>}

            {step === 3 && <div className="full"><strong>Nuôi con gì</strong><div className="grid-3 check-grid">{LIVESTOCK.map((x) => <label key={x} className="card check-item"><input type="checkbox" checked={f.livestockTypes.includes(x)} onChange={() => pick("livestockTypes", x)} />{x}</label>)}</div></div>}

            {step === 4 && <>
              <label className="auth-field full">
                <span>Yếu tố đặc biệt</span>
                <textarea className="textarea full" rows={3} placeholder="Yếu tố đặc biệt" value={f.specialFactors} onChange={(e) => setF({ ...f, specialFactors: e.target.value })} />
              </label>
              <div className="grid-2 full">
                <label className="auth-field">
                  <span>Lượng mưa năm (mm)</span>
                  <input className="input" placeholder="Lượng mưa năm (mm)" value={f.annualRainfall} onChange={(e) => setF({ ...f, annualRainfall: e.target.value })} />
                </label>
                <label className="auth-field">
                  <span>Sức tải</span>
                  <input className="input" placeholder="Sức tải" value={f.carryingCapacity} onChange={(e) => setF({ ...f, carryingCapacity: e.target.value })} />
                </label>
                <label className="auth-field full">
                  <span>Mốc bắt đầu mùa xuân</span>
                  <input className="input" placeholder="Mốc bắt đầu mùa xuân" value={f.springStart} onChange={(e) => setF({ ...f, springStart: e.target.value })} />
                </label>
              </div>
            </>}

            {step === 5 && <div className="full"><strong>Nguồn biết đến hệ thống</strong><div className="grid-3 check-grid">{HEARD.map((x) => <label key={x} className="card check-item"><input type="checkbox" checked={f.heardFrom.includes(x)} onChange={() => pick("heardFrom", x)} />{x}</label>)}</div></div>}
            {step === 5 && f.heardFrom.includes("Khác") && <label className="auth-field full"><span>Nguồn khác</span><input className="input full" placeholder="Nguồn khác (ghi rõ)" value={f.heardOther} onChange={(e) => setF({ ...f, heardOther: e.target.value })} /></label>}
          </div>

          <div className="register-actions auth-actions">
            <button type="button" className="btn btn-secondary" onClick={goBack} disabled={!canGoBack || loading}>Quay lại</button>
            {rightCta}
          </div>

          <div className="register-help">
            <strong>Gợi ý</strong>
            <span>Hoàn thành từng bước để hệ thống lưu và chuyển sang dashboard sau khi khởi tạo farm.</span>
          </div>

          {error && <p className="error-text auth-error">{error}</p>}
          {locationError && <p className="error-text auth-error">{locationError}</p>}
        </div>
      </section>
    </main>
  );
}
