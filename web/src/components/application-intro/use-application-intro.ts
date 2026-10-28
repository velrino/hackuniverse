"use client";

import { useEffect, useRef, useState } from "react";

const storageKey = "hackuniverse.intro.v1.seen";
const durationMs = 3000;
let seenInDocument = false;

export function useApplicationIntro() {
  const [visible, setVisible] = useState(false);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (startedAt.current === null) {
      if (seenInDocument) return;
      seenInDocument = true;

      try {
        if (window.localStorage.getItem(storageKey) === "1") return;
        // Persist before opening so a refresh during the intro skips it.
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // The document guard still prevents repeats when storage is blocked.
      }

      startedAt.current = performance.now();
    }

    // Strict Mode replays the effect: resume its deadline instead of skipping it.
    const remaining = Math.max(0, durationMs - (performance.now() - startedAt.current));
    const openTimer = window.setTimeout(() => setVisible(true), 0);
    const closeTimer = window.setTimeout(() => setVisible(false), remaining);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  return visible;
}
