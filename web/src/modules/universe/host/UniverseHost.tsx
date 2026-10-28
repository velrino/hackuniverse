"use client";

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LanguageSelector } from "@/i18n/language-selector";
import { LocalizedLink, useTranslations } from "@/i18n";
import { UniverseRoot, type UniverseAdapters, type UniverseCatalog } from "@/modules/universe";

const Scene = dynamic(() => import("../scene").then((module) => module.UniverseScene), { ssr: false });

function DesignLink({ children, className }: { children: ReactNode; className?: string }) {
  return <LocalizedLink href="/design" className={className}>{children}</LocalizedLink>;
}

export function UniverseHost({ catalog }: { catalog: UniverseCatalog }) {
  const copy = useTranslations("universe");
  const adapters = useMemo<UniverseAdapters>(() => ({ catalog, copy, components: { Scene, BrandLogo, LanguagePicker: LanguageSelector, DesignLink } }), [catalog, copy]);
  return <UniverseRoot adapters={adapters} />;
}
