"use client";

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/i18n/language-selector";
import { LocalizedLink, useTranslations } from "@/i18n";
import { UniverseRoot, type UniverseAdapters } from "@/modules/universe";
import { mockCatalog } from "../adapters/catalog";

const Scene = dynamic(() => import("../scene").then((module) => module.UniverseScene), { ssr: false });

function DesignLink({ children, className }: { children: ReactNode; className?: string }) {
  return <LocalizedLink href="/design" className={className}>{children}</LocalizedLink>;
}

export function UniverseHost() {
  const copy = useTranslations("universe");
  const adapters = useMemo<UniverseAdapters>(() => ({ catalog: mockCatalog, copy, components: { Scene, BrandLogo, LanguagePicker: LanguageSelector, DesignLink } }), [copy]);
  return <UniverseRoot adapters={adapters} />;
}
