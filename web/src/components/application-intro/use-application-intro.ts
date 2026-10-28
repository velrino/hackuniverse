"use client";

import { useEffect, useRef, useState } from "react";

const storageKey = "hackuniverse.intro.v1.seen";
const durationMs = 3000;
let seenInDocument = false;

export function useApplicationIntro() {
  const [state, setState] = useState({ visible: false, ready: false });
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    const settle = () => {
      const timer = window.setTimeout(() => setState({ visible: false, ready: true }), 0);
      return () => window.clearTimeout(timer);
    };
    if (startedAt.current === null) {
      if (seenInDocument) return settle();
      seenInDocument = true;

      try {
        if (window.localStorage.getItem(storageKey) === "1") return settle();
        // Persist before opening so a refresh during the intro skips it.
        window.localStorage.setItem(storageKey, "1");
      } catch {
        // The document guard still prevents repeats when storage is blocked.
      }

      startedAt.current = performance.now();
    }

    // Strict Mode replays the effect: resume its deadline instead of skipping it.
    const remaining = Math.max(0, durationMs - (performance.now() - startedAt.current));
    if (remaining === 0) return settle();
    const deadline = startedAt.current + durationMs;
    const openTimer = window.setTimeout(() => {
      const complete = performance.now() >= deadline;
      setState({ visible: !complete, ready: complete });
    }, 0);
    const closeTimer = window.setTimeout(() => setState({ visible: false, ready: true }), remaining);

    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  return state;
}
