import Image from "next/image";
import Link from "next/link";
import { withBasePath } from "@/lib/app-path";

export default function NotFound() {
  return (
    <main className="farm-404-page">
      <section className="farm-404-layout">
        <div className="farm-404-visual" aria-hidden="true">
          <div className="farm-404-road">
            <div className="farm-404-road-line" />
            <div className="farm-404-cow">
              <span>🐄</span>
            </div>
          </div>
        </div>

        <div className="farm-404-panel card">
          <div className="farm-404-brand">
            <Image src={withBasePath("/favicon.ico")} alt="KetKat-EcoFarm" width={34} height={34} className="farm-404-logo" />
            <span>KetKat-EcoFarm</span>
          </div>

          <div className="farm-404-code">404</div>
          <h1>Trang bạn đang tìm không tồn tại</h1>
          <p>Đường dẫn này không còn hợp lệ hoặc đã bị chuyển hướng sang nơi khác.</p>

          <div className="farm-404-actions">
            <Link href="/dashboard" className="btn btn-primary farm-404-button">
              Quay về tổng quan
            </Link>
            <Link href="/login" className="farm-404-link">
              Đăng xuất / đăng nhập lại
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
