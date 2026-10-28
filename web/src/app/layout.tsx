import type { Metadata } from "next";
import { headers } from "next/headers";
import localFont from "next/font/local";
import { Suspense, type ReactNode } from "react";
import { ApplicationShell } from "@/components/application-shell";
import { ApplicationIntro } from "@/components/application-intro";
import { localeRequestHeader, resolveLocale } from "@/i18n/config";
import { messages } from "@/i18n/messages";
import { I18nProvider } from "@/i18n/provider";
import "./globals.css";
import "@/styles/hud.css";

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

export const dynamic = "force-dynamic";

async function getRequestLocale() {
  return resolveLocale((await headers()).get(localeRequestHeader));
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  return { title: messages[locale].common.pageTitle };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getRequestLocale();

  return (
    <html lang={locale} className={`dark ${barlow.variable}`}>
      <body className="antialiased">
        <Suspense fallback={null}>
          <I18nProvider initialLocale={locale}>
            <ApplicationShell>{children}</ApplicationShell>
            <ApplicationIntro />
          </I18nProvider>
        </Suspense>
      </body>
    </html>
  );
}
