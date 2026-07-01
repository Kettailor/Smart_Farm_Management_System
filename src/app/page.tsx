import Image from "next/image";
import Link from "next/link";
import { withBasePath } from "@/lib/app-path";

function FeatureIcon({ type }: { type: "zone" | "data" | "trace" }) {
  if (type === "zone") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5A2.25 2.25 0 0 1 19.5 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Z" />
        <path d="M8 8.25h8M8 12h8M8 15.75h5" />
      </svg>
    );
  }

  if (type === "data") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="5.75" rx="6.75" ry="2.75" />
        <path d="M5.25 5.75v6.5c0 1.52 3.02 2.75 6.75 2.75s6.75-1.23 6.75-2.75v-6.5" />
        <path d="M5.25 12.25v6.5c0 1.52 3.02 2.75 6.75 2.75s6.75-1.23 6.75-2.75v-6.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 4.75h7.25l3.75 3.75v10.75A1.75 1.75 0 0 1 15.75 21H6.5a1.75 1.75 0 0 1-1.75-1.75V6.5A1.75 1.75 0 0 1 6.5 4.75Z" />
      <path d="M13.75 4.75v4h4" />
      <path d="M8.25 12h7.5M8.25 15h5.25" />
    </svg>
  );
}

const features = [
  {
    title: "Quản lý khu vực",
    description: "Theo dõi các khu sản xuất, trồng trọt và vận hành trên một giao diện đồng bộ.",
    type: "zone" as const,
  },
  {
    title: "Dữ liệu tập trung",
    description: "Tất cả thông tin trang trại, vùng và trạng thái hoạt động được chuẩn hóa trong một nơi.",
    type: "data" as const,
  },
  {
    title: "Truy xuất sẵn sàng",
    description: "Hạ tầng dữ liệu đã sẵn sàng cho quy trình truy xuất nguồn gốc mở rộng về sau.",
    type: "trace" as const,
  },
];

export default function HomePage() {
  return (
    <main className="marketing-home marketing-landing">
      <section className="marketing-landing-header card">
        <div className="marketing-brand-block">
          <a href="/" className="marketing-brand marketing-brand-with-logo">
            <Image src={withBasePath("/assets/logo_ketkatecofarm.png")} alt="KetKat-EcoFarm" width={42} height={42} className="marketing-brand-logo" />
            <span>KetKat-EcoFarm</span>
          </a>
          <p className="marketing-brand-subtitle">Nền tảng quản trị, bản đồ và truy xuất nông trại số</p>
        </div>

        <nav className="marketing-nav" aria-label="Điều hướng chính">
          <a href="#tinh-nang">Tính năng</a>
          <a href="#truong-hop">Trường hợp sử dụng</a>
          <a href="#pham-vi">Phạm vi</a>
          <a href="#ung-dung">Ứng dụng</a>
          <Link href="/public/vat-nuoi/quet-qr">Quét QR vật nuôi</Link>
       </nav>

        <div className="marketing-actions">
          <Link href="/public/vat-nuoi/quet-qr" className="btn btn-secondary">
            Quét QR vật nuôi
          </Link>
          <Link href="/login" className="btn btn-secondary">
            Đăng nhập
          </Link>
          <Link href="/register" className="btn btn-primary">
            Bắt đầu ngay
          </Link>
        </div>
      </section>

      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="section-eyebrow">Giải pháp quản lý nông trại tập trung</p>
          <h1>
            <span>Giải pháp quản lý nông trại tập trung,</span>
            <span>rõ ràng và sẵn sàng cho vận hành thực tế</span>
          </h1>
          <p className="marketing-hero-description">
            KetKat-EcoFarm gom bản đồ, khu vực sản xuất, dữ liệu vận hành và hồ sơ truy xuất vào một không gian quản trị sáng rõ cho đội ngũ nông trại.
          </p>
          <div className="marketing-hero-actions">
            <Link href="/register" className="btn btn-primary">
              Trải nghiệm ngay
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Đăng nhập
            </Link>
          </div>
          <div className="marketing-proof-row" aria-label="Điểm nổi bật của KetKat-EcoFarm">
            <span><strong>01</strong> Bản đồ trực quan</span>
            <span><strong>24/7</strong> Dữ liệu sẵn sàng</span>
            <span><strong>3 lớp</strong> Quản trị truy xuất</span>
          </div>
        </div>

        <div className="marketing-dashboard card" aria-hidden="true">
          <div className="marketing-dashboard-top">
            <span className="marketing-badge">Bảng điều khiển</span>
            <strong>KetKat-EcoFarm</strong>
            <span className="marketing-status-pill">Đang hoạt động</span>
          </div>

          <div className="marketing-dashboard-body">
            <aside className="marketing-side-rail">
              <span className="marketing-rail-chip active" />
              <span className="marketing-rail-chip" />
              <span className="marketing-rail-chip" />
            </aside>

            <div className="marketing-dashboard-content">
              <div className="marketing-map-panel card">
                <div className="marketing-map-head">
                  <span>Bản đồ nông trại</span>
                  <span>Vị trí trung tâm</span>
                </div>
                <div className="marketing-map-canvas">
                  <div className="marketing-field marketing-field-green" />
                  <div className="marketing-field marketing-field-blue" />
                  <div className="marketing-field marketing-field-accent" />
                  <span className="marketing-pin pin-one" />
                  <span className="marketing-pin pin-two" />
                  <span className="marketing-pin pin-three" />
                </div>
              </div>

              <div className="marketing-dashboard-stats">
                <span><strong>12</strong>Khu vực</span>
                <span><strong>86%</strong>Hoạt động ổn định</span>
                <span><strong>42</strong>Hồ sơ truy xuất</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marketing-map-link-card card">
        <div className="marketing-map-link-copy">
          <p className="section-eyebrow">Bản đồ nông trại</p>
          <h2>Khám phá hệ sinh thái đối tác KetKat-EcoFarm ngay trên bản đồ</h2>
          <p>Từ góc nhìn trực quan, bạn có thể mở ra một bức tranh kết nối nông trại rõ ràng, hiện đại và đầy tiềm năng tăng trưởng.</p>
        </div>
        <a href="/public/farm-map" className="marketing-nav-map-link marketing-nav-map-link-cta">
          <span className="marketing-nav-map-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M12 21s6.5-5.3 6.5-10.5A6.5 6.5 0 0 0 5.5 10.5C5.5 15.7 12 21 12 21Z" />
              <circle cx="12" cy="10.5" r="2.2" />
            </svg>
          </span>
          <span>Bản đồ nông trại</span>
        </a>
      </section>

      <section id="tinh-nang" className="marketing-section-grid">
        {features.map((feature) => (
          <article key={feature.title} className="marketing-feature card">
            <div className="marketing-feature-icon" aria-hidden="true">
              <FeatureIcon type={feature.type} />
            </div>
            <div>
              <h2>{feature.title}</h2>
              <p>{feature.description}</p>
            </div>
          </article>
        ))}
      </section>

      <section id="truong-hop" className="marketing-strip card">
        <div>
          <p className="section-eyebrow">Trường hợp sử dụng</p>
          <h2>Phù hợp cho trang trại cần nhìn tổng thể và thao tác nhanh</h2>
        </div>
        <p>
          Từ việc xem nhanh bản đồ, lọc khu vực, đến quản trị trang trại và tài khoản, giao diện này ưu tiên tốc độ nhận biết và thao tác một tay.
        </p>
      </section>

      <section id="pham-vi" className="marketing-grid-two">
        <article className="marketing-info card">
          <h3>Phạm vi vận hành</h3>
          <p>Dashboard, bản đồ, khu vực, dữ liệu và các điểm chạm quản trị cốt lõi.</p>
        </article>
        <article id="ung-dung" className="marketing-info card">
          <h3>Ứng dụng thực tế</h3>
          <p>Dùng cho quản lý nội bộ, theo dõi vận hành và làm nền cho mô hình truy xuất.</p>
        </article>
      </section>
    </main>
  );
}
