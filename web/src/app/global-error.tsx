"use client";

import { UIProvider } from "@velrino/ui/provider";
import localFont from "next/font/local";
import { useEffect } from "react";
import { RuntimeErrorPage, useRuntimeErrorLocale } from "@/components/errors/runtime-error";
import { captureClientException } from "@/lib/telemetry/client";
import "./globals.css";
import "@/styles/hud.css";

// This boundary replaces the root layout, including its local font definition.
const barlow = localFont({
  src: [
    { path: "../styles/fonts/barlow-400.woff2", weight: "400", style: "normal" },
    { path: "../styles/fonts/barlow-600.woff2", weight: "600", style: "normal" },
    { path: "../styles/fonts/barlow-700.woff2", weight: "700", style: "normal" },
    { path: "../styles/fonts/barlow-800.woff2", weight: "800", style: "normal" },
  ],
  variable: "--font-barlow",
  display: "swap",
});

export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = useRuntimeErrorLocale();
  useEffect(() => { captureClientException(error, { source: "react-root" }); }, [error]);
  return (
    <html lang={locale} className={`dark ${barlow.variable}`}>
      <body className="hud-body runtime-error-document">
        <title>{locale === "pt-BR" ? "Página indisponível · HackUniverse" : "Page unavailable · HackUniverse"}</title>
        <UIProvider appearance="sci-fi">
          <RuntimeErrorPage retry={retry} locale={locale} />
        </UIProvider>
      </body>
    </html>
  );
}
