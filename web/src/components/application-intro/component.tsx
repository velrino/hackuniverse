"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand-logo";
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
  const { preferences, musicStatus, effectsStatus, musicError, effectsError, playCue, unlockFromGesture } = useAudio();
  const requireInteraction = !preferences.muted && (preferences.musicEnabled && preferences.musicVolume > 0 && musicStatus !== "playing" && (!musicError || musicError === "blocked") || preferences.effectsEnabled && preferences.effectsVolume > 0 && effectsStatus !== "ready" && (!effectsError || effectsError === "blocked"));
  const { phase, visible, ready, progress, waitingForPreparation, start } = useApplicationIntro({ requireInteraction, preparationReady: preparing.size === 0 });
  const copy = useTranslations("applicationIntro");
  const played = useRef(false);
  const [entering, setEntering] = useState(false);
  const enteredAt = useRef(0);

  useEffect(() => {
    if (phase !== "entry") return;
    if (!played.current && !preferences.muted && preferences.effectsEnabled && effectsStatus === "ready") {
      played.current = true;
      playCue("menu-open");
    }
    if (!entering) return;
    // Keep the welcome visible for its activation acknowledgement, never for
    // a whole audio download or an autoplay timeout. No cue is queued afterward.
    const pending = !preferences.muted && preferences.effectsEnabled && preferences.effectsVolume > 0 && effectsStatus !== "ready" && !effectsError;
    const delay = pending ? Math.max(0, enteredAt.current + 750 - performance.now()) : 0;
    const timer = window.setTimeout(start, delay);
    return () => window.clearTimeout(timer);
  }, [phase, entering, preferences.muted, preferences.effectsEnabled, preferences.effectsVolume, effectsStatus, effectsError, playCue, start]);

  const enter = () => {
    // Keep both activation-sensitive APIs in the trusted button stack.
    unlockFromGesture();
    enteredAt.current = performance.now();
    setEntering(true);
  };

  return (
    <ApplicationIntroReadyContext.Provider value={ready}>
      <ApplicationPreparationContext.Provider value={registerPreparation}>
        <div className="application-intro-content" data-application-intro={phase} inert={!ready}>{children}</div>
      </ApplicationPreparationContext.Provider>
      <Dialog open={phase === "entry"}>
        <DialogContent className="application-intro-entry" showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <BrandLogo size={72} eager className="application-intro-entry__logo" />
          <DialogHeader>
            <DialogTitle>{copy.label}</DialogTitle>
            <DialogDescription>{copy.entryDetail}</DialogDescription>
          </DialogHeader>
          <Button type="button" onClick={enter} disabled={entering} aria-busy={entering} data-audio-ignore>{copy.enter}</Button>
        </DialogContent>
      </Dialog>
      {visible && <FullScreenLoader progress={waitingForPreparation ? undefined : progress} label={copy.loadingLabel} detail={waitingForPreparation ? copy.preparingDetail : copy.detail} />}
    </ApplicationIntroReadyContext.Provider>
  );
}
