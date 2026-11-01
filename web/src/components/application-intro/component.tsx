"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { useTranslations } from "@/i18n";
import { useAudio } from "@/modules/audio";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApplicationIntroReadyContext, ApplicationPreparationContext } from "./context";
import { useApplicationIntro } from "./use-application-intro";
import "./styles.css";

export function ApplicationIntro({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [preparation, setPreparation] = useState<{ registered: boolean; pending: ReadonlySet<symbol> }>(() => ({ registered: false, pending: new Set() }));
  const registerPreparation = useCallback(() => {
    const token = Symbol();
    setPreparation((current) => ({ registered: true, pending: new Set(current.pending).add(token) }));
    return () => setPreparation((current) => {
      const next = new Set(current.pending);
      next.delete(token);
      return { registered: true, pending: next };
    });
  }, []);
  // The page can hydrate after the layout. An explorer's empty registry is
  // not settled until its first scene participant has actually registered.
  const preparationReady = (pathname !== "/" || preparation.registered) && preparation.pending.size === 0;
  const { phase, visible, ready } = useApplicationIntro({ preparationReady });
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
      {visible && <FullScreenLoader label={copy.loadingLabel} detail={copy.preparingDetail} />}
    </ApplicationIntroReadyContext.Provider>
  );
}
