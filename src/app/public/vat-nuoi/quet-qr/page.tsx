import Image from "next/image";
import Link from "next/link";
import PublicLivestockQrScanner from "@/components/public-livestock-qr-scanner";
import { withBasePath } from "@/lib/app-path";
import styles from "../public-livestock-page.module.css";

export const dynamic = "force-dynamic";

export default function PublicLivestockQrScannerPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand}>
          <Image src={withBasePath("/assets/logo_ketkatecofarm.png")} alt="KetKat-EcoFarm" width={36} height={36} />
          <span>KetKat-EcoFarm</span>
        </Link>
        <nav className={styles.nav} aria-label="Điều hướng public">
          <Link className={styles.linkButton} href="/public/farm-map">Bản đồ công khai</Link>
          <Link className={`${styles.linkButton} ${styles.primaryButton}`} href="/login">Đăng nhập</Link>
        </nav>
      </header>

      <div className={styles.scannerWrap}>
        <PublicLivestockQrScanner />
      </div>
    </main>
  );
}
