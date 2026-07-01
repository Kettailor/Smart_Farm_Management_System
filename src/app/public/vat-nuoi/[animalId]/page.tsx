import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { withBasePath } from "@/lib/app-path";
import { loadPublicLivestockAnimalDetailById } from "@/lib/livestock-detail";
import { buildPublicLivestockAnimalQrValue } from "@/lib/public-livestock-url";
import { renderQrSvg } from "@/lib/qr-code";
import styles from "../public-livestock-page.module.css";

type PageProps = {
  params: { animalId: string };
};

export const dynamic = "force-dynamic";

function requestOrigin() {
  const headerStore = headers();
  const host = headerStore.get("x-forwarded-host")?.split(",")[0]?.trim() || headerStore.get("host") || "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  return `${protocol}://${host}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Chưa cập nhật";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa cập nhật";
  return date.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatNumber(value: number | null | undefined, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "Chưa cập nhật";
  return `${new Intl.NumberFormat("vi-VN").format(value)}${suffix}`;
}

function ageLabel(value: string | null) {
  if (!value) return "Chưa cập nhật";
  const start = new Date(value).getTime();
  if (Number.isNaN(start)) return "Chưa cập nhật";
  const months = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24 * 30.4375)));
  if (months < 1) return "Dưới 1 tháng";
  if (months < 24) return `${months} tháng`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} năm ${rest} tháng` : `${years} năm`;
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function statusLabel(status: string | null) {
  const raw = String(status ?? "").trim();
  if (!raw) return "Chưa cập nhật";
  const normalized = normalizeText(raw);
  if (normalized.includes("tu vong") || normalized.includes("deceased") || normalized.includes("dead")) return "Đã tử vong";
  if (normalized.includes("dang hoat dong") || normalized.includes("active")) return "Đang theo dõi";
  if (normalized.includes("theo doi") || normalized.includes("canh bao") || normalized.includes("benh")) return "Cần chú ý";
  if (normalized.includes("ngung") || normalized.includes("inactive")) return "Ngừng theo dõi";
  return raw;
}

function eventTypeLabel(type: string | null) {
  if (!type) return "Sự kiện";
  return type.replace(/_/g, " ");
}

function FieldGrid({ items }: { items: Array<{ label: string; value: string | null }> }) {
  return (
    <dl className={styles.fieldGrid}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value || "Chưa cập nhật"}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function PublicLivestockAnimalPage({ params }: PageProps) {
  const detail = await loadPublicLivestockAnimalDetailById(params.animalId);
  if (!detail) notFound();

  const animal = detail.animal;
  const latestUpdate = animal.updatedAt || animal.createdAt;
  const qrValue = buildPublicLivestockAnimalQrValue(animal.id, requestOrigin());

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Image src={withBasePath("/assets/logo_ketkatecofarm.png")} alt="KetKat-EcoFarm" width={36} height={36} />
          <span>KetKat-EcoFarm</span>
        </Link>
        <nav className={styles.nav} aria-label="Điều hướng public">
          <Link className={styles.linkButton} href="/public/vat-nuoi/quet-qr">Quét QR khác</Link>
          <Link className={styles.linkButton} href="/public/farm-map">Bản đồ công khai</Link>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.qrCard} dangerouslySetInnerHTML={{ __html: renderQrSvg(qrValue, { margin: 4 }) }} />
        <div className={styles.heroContent}>
          <div className={styles.heroTitle}>
            <div>
              <p className={styles.eyebrow}>Hồ sơ truy xuất vật nuôi</p>
              <h1>{animal.code || animal.qrCode || "Cá thể chưa có mã"}</h1>
              <span>{animal.species || detail.group.species} · {animal.breed || detail.group.breed || "Chưa cập nhật giống"}</span>
            </div>
            <span className={styles.statusPill}>{statusLabel(animal.status)}</span>
          </div>
          <p className={styles.heroDescription}>
            {animal.description || `Cá thể thuộc nhóm ${detail.group.name} tại ${detail.farm.name}.`}
          </p>
          <div className={styles.quickFacts}>
            <div><span>Mã QR</span><strong>{animal.qrCode || "Chưa cập nhật"}</strong></div>
            <div><span>Nhận diện</span><strong>{animal.identity || "Chưa cập nhật"}</strong></div>
            <div><span>Giới tính</span><strong>{animal.gender || "Chưa cập nhật"}</strong></div>
            <div><span>Tuổi</span><strong>{ageLabel(animal.birthDate)}</strong></div>
            <div><span>Cập nhật</span><strong>{formatDate(latestUpdate)}</strong></div>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Thông tin cơ bản</p>
            <h2>Chi tiết cá thể</h2>
          </div>
          <span className={styles.badge}>{detail.zone?.name || "Chưa gắn khu vực"}</span>
        </div>
        <FieldGrid
          items={[
            { label: "Trang trại", value: detail.farm.name },
            { label: "Địa điểm", value: detail.farm.locationName },
            { label: "Nhóm", value: `${detail.group.name} (${detail.group.code})` },
            { label: "Mục đích", value: detail.group.purpose },
            { label: "Mã vật nuôi", value: animal.code },
            { label: "Thẻ nhận diện", value: animal.identity },
            { label: "Loài", value: animal.species || detail.group.species },
            { label: "Giống", value: animal.breed || detail.group.breed },
            { label: "Ngày sinh/nhập", value: formatDate(animal.birthDate) },
            { label: "Nguồn gốc", value: animal.origin },
            { label: "Màu lông", value: animal.colouring },
            { label: "Trạng thái sinh sản", value: animal.reproductiveState },
            { label: "Mã mẹ", value: animal.maternityId },
            { label: "Mã bố", value: animal.paternityId },
            { label: "Khu vực", value: detail.zone?.name ?? null },
            { label: "Trạng thái khu vực", value: detail.zone?.status ?? null },
          ]}
        />
      </section>

      <section className={styles.timelinePanel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Nhật ký cá thể</p>
            <h2>Sự kiện gần đây</h2>
          </div>
          <span className={styles.badge}>{formatNumber(detail.events.length)} sự kiện</span>
        </div>
        <div className={styles.timeline}>
          {detail.events.map((event) => (
            <article key={event.id} className={styles.timelineItem}>
              <strong>{event.title || eventTypeLabel(event.type)}</strong>
              <span>{formatDate(event.eventDate || event.createdAt)}</span>
              <p>
                {eventTypeLabel(event.type)}
                {event.numericValue != null ? ` · ${formatNumber(event.numericValue, event.unit ? ` ${event.unit}` : "")}` : ""}
                {event.note ? ` · ${event.note}` : ""}
              </p>
            </article>
          ))}
          {detail.events.length === 0 && (
            <div className={styles.emptyState}>Chưa có sự kiện riêng cho cá thể này.</div>
          )}
        </div>
      </section>

      <section className={styles.timelinePanel}>
        <div className={styles.sectionHead}>
          <div>
            <p className={styles.eyebrow}>Sổ khám bệnh</p>
            <h2>Điều trị gần đây</h2>
          </div>
          <span className={styles.badge}>{formatNumber(detail.treatments.length)} lần</span>
        </div>
        <div className={styles.timeline}>
          {detail.treatments.map((treatment) => (
            <article key={treatment.id} className={styles.timelineItem}>
              <strong>{treatment.name || treatment.type || "Điều trị"}</strong>
              <span>{formatDate(treatment.treatmentDate || treatment.createdAt)}</span>
              <p>
                {treatment.method || treatment.status || "Đã ghi nhận"}
                {treatment.dosage != null ? ` · ${formatNumber(treatment.dosage, treatment.dosageUnit ? ` ${treatment.dosageUnit}` : "")}` : ""}
                {treatment.note ? ` · ${treatment.note}` : ""}
              </p>
            </article>
          ))}
          {detail.treatments.length === 0 && (
            <div className={styles.emptyState}>Chưa có bản ghi điều trị riêng cho cá thể này.</div>
          )}
        </div>
      </section>
    </main>
  );
}
