"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { withBasePath } from "@/lib/app-path";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="farm-error-page">
      <section className="farm-error-layout">
        <div className="farm-error-visual" aria-hidden="true">
          <div className="farm-error-cloud farm-error-cloud-a" />
          <div className="farm-error-cloud farm-error-cloud-b" />
          <div className="farm-error-barn">
            <div className="farm-error-barn-roof" />
            <div className="farm-error-barn-body">
              <span className="farm-error-window" />
              <span className="farm-error-window" />
              <span className="farm-error-door" />
            </div>
          </div>
          <div className="farm-error-tractor">🚜</div>
        </div>

        <div className="farm-error-panel card">
          <div className="farm-error-brand">
            <Image src={withBasePath("/favicon.ico")} alt="KetKat-EcoFarm" width={34} height={34} className="farm-error-logo" />
            <span>KetKat-EcoFarm</span>
          </div>

          <div className="farm-error-code">500</div>
          <h1>Hệ thống đang gặp sự cố</h1>
          <p>Không thể tải trang lúc này. Vui lòng thử lại hoặc quay về trang tổng quan.</p>

          <div className="farm-error-actions">
            <button type="button" className="btn btn-primary farm-error-button" onClick={() => reset()}>
              Thử lại
            </button>
            <Link href="/dashboard" className="btn btn-secondary farm-error-button">
              Quay về tổng quan
            </Link>
          </div>

          <p className="farm-error-hint">Nếu lỗi vẫn còn, hãy đăng nhập lại hoặc thử lại sau ít phút.</p>
        </div>
      </section>
    </main>
  );
}
