"use client";

import Image from "next/image";
import NotificationBell from "@/components/notification-bell";
import TopbarUserMenu from "@/components/topbar-user-menu";
import { withBasePath } from "@/lib/app-path";
import styles from "./dashboard-shell.module.css";

type DashboardShellProps = {
  farmName: string;
  activePath: string;
  children: React.ReactNode;
};

type MenuIconProps = {
  name: string;
};

const MENU_ITEMS = [
  { label: "Tổng quan", href: "/dashboard", icon: "dashboard" },
  { label: "Bản đồ trang trại", href: "/dashboard/map", icon: "map" },
  { label: "Vật nuôi", href: "/dashboard/vat-nuoi", icon: "livestock" },
  { label: "Quản lý khu vực", href: "/dashboard/khu-vuc", icon: "zones" },
  { label: "Chăn thả", href: "/dashboard/chan-tha", icon: "pasture" },
  { label: "Quản lý kho", href: "/dashboard/quan-ly-kho", icon: "warehouse" },
  { label: "Hồ sơ hóa chất", href: "/dashboard/ho-so-hoa-chat", icon: "chemical" },
  { label: "Dự báo thời tiết", href: "/dashboard/thoi-tiet", icon: "weather" },
  { label: "Công việc", href: "/dashboard/cong-viec", icon: "plan" },
];

function MenuIcon({ name }: MenuIconProps) {
  switch (name) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1v-8.5Z" />
        </svg>
      );
    case "map":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2V6Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case "livestock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M6 13c0-2.8 2.2-5 5-5s5 2.2 5 5" />
          <path d="M5 13h14l-1.2 6H6.2L5 13Z" />
          <path d="M8 8 7 5M16 8l1-3" />
        </svg>
      );
    case "zones":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 6h7v12H4z" />
          <path d="M13 4h7v16h-7z" />
        </svg>
      );
    case "pasture":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 20h16M6 20V8l6-3 6 3v12" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
    case "warehouse":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M3 20V9l9-5 9 5v11" />
          <path d="M7 20v-8h10v8" />
          <path d="M9 16h6M9 12h6" />
        </svg>
      );
    case "chemical":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M9 3h6" />
          <path d="M10 3v5l-5 9a3 3 0 0 0 2.6 4.5h8.8A3 3 0 0 0 19 17l-5-9V3" />
          <path d="M8 14h8M9 18h6" />
        </svg>
      );
    case "weather":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 17a4 4 0 1 1 1.1-7.84A5 5 0 0 1 17 11a3.5 3.5 0 0 1 0 7H7Z" />
        </svg>
      );
    case "plan":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 6h16M4 12h16M4 18h16" />
          <path d="M8 6v12M16 6v12" />
        </svg>
      );
    case "users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M4 12h16" />
        </svg>
      );
  }
}

export default function DashboardShell({ farmName, activePath, children }: DashboardShellProps) {
  const isActive = (href: string) => {
    if (href === "/dashboard") return activePath === "/dashboard";
    return activePath === href || activePath.startsWith(`${href}/`);
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <Image src={withBasePath("/favicon.ico")} alt="KetKat-EcoFarm" width={34} height={34} className={styles.brandLogo} />
          <div>
            <div className={styles.brandText}>KetKat-EcoFarm</div>
            <div className={styles.brandSubtext}>{farmName}</div>
          </div>
        </div>
        <div className={styles.headerActions}>
          <NotificationBell />
          <TopbarUserMenu />
        </div>
      </header>

      <section className={styles.layout}>
        <aside className={styles.sidebar}>
          <nav className={styles.menu}>
            {MENU_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <a
                  key={item.label}
                  href={item.href}
                  className={`${styles.menuItem} ${active ? styles.menuItemActive : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <span className={styles.menuIcon}>
                    <MenuIcon name={item.icon} />
                  </span>
                  <span>{item.label}</span>
                </a>
              );
            })}
          </nav>
        </aside>
        <div className={styles.content}>{children}</div>
      </section>
    </main>
  );
}
