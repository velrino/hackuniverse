"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { useTranslations } from "@/i18n";
import { useAudio } from "@/modules/audio";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApplicationIntroReadyContext, ApplicationPreparationContext } from "./context";
import { useApplicationIntro } from "./use-application-intro";
import "./styles.css";

export function ApplicationIntro({ children }: { children: ReactNode }) {
  const [preparing, setPreparing] = useState<ReadonlySet<symbol>>(() => new Set());
  const registerPreparation = useCallback(() => {
    const token = Symbol();
    setPreparing((current) => new Set(current).add(token));
    return () => setPreparing((current) => {
      const next = new Set(current);
      next.delete(token);
      return next;
    });
  }, []);
  const { phase, visible, ready, progress, waitingForPreparation } = useApplicationIntro({ preparationReady: preparing.size === 0 });
  const copy = useTranslations("applicationIntro");
  const { preferences, effectsStatus, playCue } = useAudio();
  const played = useRef(false);

  useEffect(() => {
    if (played.current || phase !== "loading" || effectsStatus !== "ready" || preferences.muted ||
        !preferences.effectsEnabled || preferences.effectsVolume <= 0) return;
    // Best effort while startup is visible; never request audio activation or
    // defer this cue until after the loader has released the application.
    played.current = true;
    playCue("menu-open");
  }, [phase, effectsStatus, preferences.muted, preferences.effectsEnabled, preferences.effectsVolume, playCue]);

  return (
    <ApplicationIntroReadyContext.Provider value={ready}>
      <ApplicationPreparationContext.Provider value={registerPreparation}>
        <div className="application-intro-content" data-application-intro={phase} inert={!ready}>{children}</div>
      </ApplicationPreparationContext.Provider>
      {visible && <FullScreenLoader progress={waitingForPreparation ? undefined : progress} label={copy.loadingLabel} detail={waitingForPreparation ? copy.preparingDetail : copy.detail} />}
    </ApplicationIntroReadyContext.Provider>
  );
}
