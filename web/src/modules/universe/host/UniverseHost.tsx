"use client";

import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { useApplicationIntroReady } from "@/components/application-intro";
import { LanguageSelector } from "@/i18n/language-selector";
import { LocalizedLink, useI18n, useTranslations } from "@/i18n";
import { UniverseRoot, type UniverseAdapters, type UniverseCatalog, type UniverseTourDefinition } from "@/modules/universe";

const Scene = dynamic(() => import("../scene").then((module) => module.UniverseScene), { ssr: false });
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const getReducedMotion = () => window.matchMedia(motionQuery).matches;

function DesignLink({ children, className }: { children: ReactNode; className?: string }) {
  return <LocalizedLink href="/design" className={className}>{children}</LocalizedLink>;
}

export function UniverseHost({ catalog, tour }: { catalog: UniverseCatalog; tour?: UniverseTourDefinition }) {
  const copy = useTranslations("universe");
  const { format } = useI18n();
  const presentationReady = useApplicationIntroReady();
  const reducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, () => true);
  const adapters = useMemo<UniverseAdapters>(() => ({ catalog, copy, tour, presentationReady, autoTour: !reducedMotion, formatNumber: format.number, components: { Scene, BrandLogo, LanguagePicker: LanguageSelector, DesignLink } }), [catalog, copy, tour, presentationReady, reducedMotion, format.number]);
  return <UniverseRoot adapters={adapters} />;
}
