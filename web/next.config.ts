import type { NextConfig } from "next";
import { brandLogoSrc } from "./src/configs/brand";

const brandLogoUrl = new URL(brandLogoSrc, "https://hackuniverse.invalid");

const nextConfig: NextConfig = {
  // Preserve error details for scripts served from a CORS-enabled asset origin.
  crossOrigin: "anonymous",
  allowedDevOrigins: ["[::1]"],
  images: {
    localPatterns: [
      { pathname: brandLogoUrl.pathname, search: brandLogoUrl.search },
    ],
  },
  /* config options here */
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
