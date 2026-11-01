"use client";

import { useEffect, useRef, useState } from "react";
import { browserStorage } from "../../lib/storage";

const storageKey = "hackuniverse.intro.v1.seen";
let seenInDocument = false;

type IntroPhase = "checking" | "loading" | "ready";
type IntroState = { phase: IntroPhase; visible: boolean; ready: boolean };

/** The first visit waits for real preparation without a minimum animation time. */
export function useApplicationIntro({ preparationReady = true }: { preparationReady?: boolean } = {}) {
  const [state, setState] = useState<IntroState>({ phase: "checking", visible: false, ready: false });
  const checked = useRef(false);
  const skipped = useRef(false);
  const released = useRef(false);

  useEffect(() => {
    if (!checked.current) {
      checked.current = true;
      skipped.current = seenInDocument;
      try {
        skipped.current ||= browserStorage.getItem(storageKey) === "1";
      } catch { /* The in-document guard remains available when storage is blocked. */ }
      if (!skipped.current) {
        seenInDocument = true;
        try { browserStorage.setItem(storageKey, "1"); }
        catch { /* Refresh protection is best effort when storage is blocked. */ }
      }
    }

    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      const ready = skipped.current || released.current || preparationReady;
      if (ready) released.current = true;
      setState({ phase: ready ? "ready" : "loading", visible: !ready, ready });
    });
    return () => { current = false; };
  }, [preparationReady]);

  return state;
}
