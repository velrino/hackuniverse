import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "3D-solar-system",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
