"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { useTranslations } from "@/i18n";
import type { ReactNode } from "react";
import { ApplicationIntroReadyContext } from "./context";
import { useApplicationIntro } from "./use-application-intro";

export function ApplicationIntro({ children }: { children: ReactNode }) {
  const { visible, ready, progress } = useApplicationIntro();
  const copy = useTranslations("applicationIntro");

  return (
    <ApplicationIntroReadyContext.Provider value={ready}>
      {children}
      {visible && <FullScreenLoader progress={progress} label={copy.label} detail={copy.detail} />}
    </ApplicationIntroReadyContext.Provider>
  );
}
