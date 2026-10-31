"use client";

import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo } from "@/components/brand-logo";
import { useTranslations } from "@/i18n";
import { useAudio } from "@/modules/audio";
import { useEffect, useRef, type ReactNode } from "react";
import { ApplicationIntroReadyContext } from "./context";
import { useApplicationIntro } from "./use-application-intro";
import "./styles.css";

export function ApplicationIntro({ children }: { children: ReactNode }) {
  const { preferences, musicStatus, effectsStatus, musicError, effectsError, playCue, unlockFromGesture } = useAudio();
  const requireInteraction = !preferences.muted && (preferences.musicEnabled && preferences.musicVolume > 0 && musicStatus !== "playing" && (!musicError || musicError === "blocked") || preferences.effectsEnabled && preferences.effectsVolume > 0 && effectsStatus !== "ready" && (!effectsError || effectsError === "blocked"));
  const { phase, visible, ready, progress, start } = useApplicationIntro({ requireInteraction });
  const copy = useTranslations("applicationIntro");
  const played = useRef(false);

  useEffect(() => {
    if (!visible || played.current || preferences.muted || !preferences.effectsEnabled || effectsStatus !== "ready") return;
    played.current = true;
    playCue("menu-open");
  }, [visible, preferences.muted, preferences.effectsEnabled, effectsStatus, playCue]);

  const enter = () => {
    // Keep both activation-sensitive APIs in the trusted button stack.
    unlockFromGesture();
    start();
  };

  return (
    <ApplicationIntroReadyContext.Provider value={ready}>
      <div className="application-intro-content" data-application-intro={phase} inert={!ready}>{children}</div>
      <Dialog open={phase === "entry"}>
        <DialogContent className="application-intro-entry" showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()} onInteractOutside={(event) => event.preventDefault()}>
          <BrandLogo size={72} eager className="application-intro-entry__logo" />
          <DialogHeader>
            <DialogTitle>{copy.label}</DialogTitle>
            <DialogDescription>{copy.entryDetail}</DialogDescription>
          </DialogHeader>
          <Button type="button" onClick={enter} data-audio-ignore>{copy.enter}</Button>
        </DialogContent>
      </Dialog>
      {visible && <FullScreenLoader progress={progress} label={copy.label} detail={copy.detail} />}
    </ApplicationIntroReadyContext.Provider>
  );
}
