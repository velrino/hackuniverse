"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBrowserAudioPorts } from "./adapters/browser-audio";
import { createAudioController } from "./domain/controller";
import { AudioContext } from "./hooks/use-audio";

/** Global UI cues are click-only; keyboard activation naturally produces the same click. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createAudioController(createBrowserAudioPorts()));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => {
    controller.mount();
    const visibility = () => controller.setVisible(!document.hidden);
    visibility();
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest('button, [role="button"], [role="tab"], [role="menuitem"], a[href]');
      if (!control || control.matches(":disabled") || control.closest('[aria-disabled="true"], [inert], [data-audio-silent], [data-audio-ignore]')) return;
      if (control.closest('[data-slot="dialog-close"]') && control.closest("[data-audio-menu]")) return;
      controller.playCue("ui-select");
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("click", click);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("click", click);
      controller.dispose();
    };
  }, [controller]);
  const value = useMemo(() => ({ ...snapshot, playCue: controller.playCue, setMusicEnabled: controller.setMusicEnabled, setEffectsEnabled: controller.setEffectsEnabled, enableMusic: controller.enableMusic, enableEffects: controller.enableEffects, setMusicVolume: controller.setMusicVolume, setEffectsVolume: controller.setEffectsVolume, retry: controller.retry }), [snapshot, controller]);
  return <AudioContext value={value}>{children}</AudioContext>;
}
