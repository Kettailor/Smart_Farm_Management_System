import type { Metadata } from "next";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import AppNavigationLoading from "@/components/app-navigation-loading";
import BasePathRuntime from "@/components/base-path-runtime";
import { withBasePath } from "@/lib/app-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "KetKat-EcoFarm",
  description: "Nền tảng quản trị và truy xuất nông trại số KetKat-EcoFarm",
  icons: {
    icon: withBasePath("/assets/logo_ketkatecofarm.ico"),
  },
};

const bodyStyle = {
  "--marketing-hero-background": `linear-gradient(90deg, rgba(8,29,18,0.9) 0%, rgba(11,46,29,0.76) 44%, rgba(20,57,42,0.24) 100%), linear-gradient(180deg, rgba(14,24,18,0.06), rgba(14,24,18,0.38)), url("${withBasePath("/assets/img/landing-register.jpg")}")`,
} as CSSProperties;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body style={bodyStyle}>
        <BasePathRuntime />
        <Suspense fallback={null}>
          <AppNavigationLoading />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
