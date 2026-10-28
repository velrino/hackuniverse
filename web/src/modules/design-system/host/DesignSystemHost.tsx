"use client";

import "@velrino/ui/showcase.css";

import { useMemo } from "react";
import { DesignSystemRoot, type DesignSystemAdapters } from "@/modules/design-system";
import { BrandLogo } from "@/components/brand-logo";
import { brandName } from "@/configs/brand";
import { useTranslations } from "@/i18n";
import { LanguageSelector } from "@/i18n/language-selector";

export function DesignSystemHost() {
  const copy = useTranslations("designSystem");
  const { close: closeLabel } = useTranslations("common");
  const adapters = useMemo<DesignSystemAdapters>(() => ({
    localization: { copy, closeLabel },
    components: { LanguagePicker: LanguageSelector, BrandLogo },
    brand: { name: brandName },
  }), [copy, closeLabel]);

  return <DesignSystemRoot adapters={adapters} />;
}
