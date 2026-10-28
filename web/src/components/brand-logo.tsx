import Image from "next/image";
import { brandLogoSrc } from "@/configs/brand";

type BrandLogoProps = { size?: number; alt?: string; className?: string; eager?: boolean };

export function BrandLogo({ size = 44, alt = "", className, eager = false }: BrandLogoProps) {
  return <Image src={brandLogoSrc} alt={alt} width={size} height={size} loading={eager ? "eager" : "lazy"} className={className} />;
}
