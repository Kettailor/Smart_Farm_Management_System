import Image from "next/image";
import { withBasePath } from "@/lib/app-path";

type CowLoadingProps = {
  label?: string;
  size?: "sm" | "md" | "lg";
  tone?: "inline" | "overlay";
};

export default function CowLoading({ label = "Đang tải...", size = "sm", tone = "inline" }: CowLoadingProps) {
  return (
    <span className={`cow-loading cow-loading-${size} cow-loading-${tone}`} role="status" aria-live="polite">
      <Image src={withBasePath("/assets/img/con_bo.svg")} alt="" width={38} height={38} aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
