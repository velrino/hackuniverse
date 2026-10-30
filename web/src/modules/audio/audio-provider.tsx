"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { createBrowserAudioPorts } from "./adapters/browser-audio";
import { createAudioController } from "./domain/controller";
import { AudioContext } from "./hooks/use-audio";
import { isAudioUnlockGesture } from "./domain/gesture";
import { audioToggleCue, audioToggleState } from "./domain/ui-cue";

/** Global UI cues are click-only; keyboard activation naturally produces the same click. */
export function AudioProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createAudioController(createBrowserAudioPorts()));
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => {
    controller.mount(!document.hidden);
    const visibility = () => controller.setVisible(!document.hidden);
    visibility();
    const selector = 'button, [role="button"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], a[href]';
    const toggles = new WeakMap<Element, "on" | "off">();
    const ignored = new WeakSet<Element>();
    const silent = (control: Element) => control.matches(":disabled") || Boolean(control.closest('[aria-disabled="true"], [inert], [data-audio-silent], [data-audio-ignore]'));
    const toggleState = (control: Element) => audioToggleState({ role: control.getAttribute("role"), pressed: control.getAttribute("aria-pressed"), checked: control.getAttribute("aria-checked"), destination: control.hasAttribute("data-destination-id"), readOnly: control.matches('[aria-readonly="true"], [data-readonly], [readonly]') });
    const beforeClick = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest(selector);
      if (!control) return;
      if (silent(control)) { ignored.add(control); return; }
      const state = toggleState(control);
      if (state) toggles.set(control, state);
    };
    const click = (event: MouseEvent) => {
      if (!event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest(selector);
      if (!control) return;
      if (ignored.has(control)) { ignored.delete(control); return; }
      if (silent(control)) return;
      if (control.closest('[data-slot="dialog-close"]') && control.closest("[data-audio-menu]")) return;
      const before = toggles.get(control);
      toggles.delete(control);
      if (before) {
        queueMicrotask(() => {
          const cue = audioToggleCue(before, toggleState(control), control.isConnected);
          if (cue) controller.playCue(cue);
        });
        return;
      }
      controller.playCue("ui-select");
    };
    const unlock = (event: PointerEvent | KeyboardEvent) => {
      const target = event.target;
      const silent = target instanceof Element && Boolean(target.closest('[data-audio-silent], [inert], [aria-disabled="true"], :disabled'));
      if (isAudioUnlockGesture(event, silent, navigator.userActivation?.isActive)) controller.unlockFromGesture();
    };
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("click", click);
    document.addEventListener("click", beforeClick, true);
    document.addEventListener("pointerdown", unlock, true);
    document.addEventListener("pointerup", unlock, true);
    document.addEventListener("keydown", unlock, true);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("click", click);
      document.removeEventListener("click", beforeClick, true);
      document.removeEventListener("pointerdown", unlock, true);
      document.removeEventListener("pointerup", unlock, true);
      document.removeEventListener("keydown", unlock, true);
      controller.dispose();
    };
  }, [controller]);
  const value = useMemo(() => ({ ...snapshot, playCue: controller.playCue, setMusicEnabled: controller.setMusicEnabled, setEffectsEnabled: controller.setEffectsEnabled, enableMusic: controller.enableMusic, enableEffects: controller.enableEffects, setMusicVolume: controller.setMusicVolume, setEffectsVolume: controller.setEffectsVolume, retry: controller.retry }), [snapshot, controller]);
  return <AudioContext value={value}>{children}</AudioContext>;
}
