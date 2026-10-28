"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { useTranslations } from "@/i18n";
import { useApplicationIntro } from "./use-application-intro";

export function ApplicationIntro() {
  const visible = useApplicationIntro();
  const copy = useTranslations("applicationIntro");

  return visible ? (
    <FullScreenLoader progress={null} label={copy.label} detail={copy.detail} />
  ) : null;
}
