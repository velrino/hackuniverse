"use client";

import { useEffect, useRef, useState } from "react";

const storageKey = "hackuniverse.intro.v1.seen";
const durationMs = 3000;
const progressIntervalMs = 50;
const completionFrameMs = 50;
let seenInDocument = false;

export function useApplicationIntro() {
  const [state, setState] = useState({ visible: false, ready: false, progress: 0 });
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    const settle = () => {
      const timer = window.setTimeout(() => setState({ visible: false, ready: true, progress: 100 }), 0);
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
    const start = startedAt.current;
    const deadline = start + durationMs;
    const closeAt = deadline + completionFrameMs;
    const now = performance.now();
    if (now >= closeAt) return settle();
    const updateProgress = () => {
      const current = performance.now();
      const elapsed = Math.max(0, current - start);
      const complete = current >= closeAt;
      setState({
        visible: !complete,
        ready: complete,
        progress: Math.min(100, elapsed / durationMs * 100),
      });
    };
    const openTimer = window.setTimeout(() => {
      updateProgress();
    }, 0);
    const progressTimer = window.setInterval(updateProgress, progressIntervalMs);
    const completeTimer = window.setTimeout(() => {
      window.clearInterval(progressTimer);
      updateProgress();
    }, Math.max(0, Math.ceil(deadline - now)));
    // Leave one short completion frame so 100% is visible before releasing the tour.
    const closeTimer = window.setTimeout(() => {
      window.clearInterval(progressTimer);
      setState({ visible: false, ready: true, progress: 100 });
    }, closeAt - now);

    return () => {
      window.clearTimeout(openTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(completeTimer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  return state;
}
