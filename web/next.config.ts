import type { NextConfig } from "next";
import { brandLogoSrc } from "./src/configs/brand";

const brandLogoUrl = new URL(brandLogoSrc, "https://hackuniverse.invalid");

const nextConfig: NextConfig = {
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
