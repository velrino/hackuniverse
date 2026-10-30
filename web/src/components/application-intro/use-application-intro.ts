"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { browserStorage } from "../../lib/storage";

const storageKey = "hackuniverse.intro.v1.seen";
const durationMs = 3000;
const progressIntervalMs = 50;
const completionFrameMs = 50;
let seenInDocument = false;

type IntroPhase = "checking" | "entry" | "loading" | "ready";
type IntroState = { phase: IntroPhase; visible: boolean; ready: boolean; progress: number };

export function useApplicationIntro({ requireInteraction = false }: { requireInteraction?: boolean } = {}) {
  const [state, setState] = useState<IntroState>({ phase: "checking", visible: false, ready: false, progress: 0 });
  const [requested, setRequested] = useState(false);
  const checked = useRef(false);
  const skipped = useRef(false);
  const startedAt = useRef<number | null>(null);
  const start = useCallback(() => setRequested(true), []);

  useEffect(() => {
    const settle = () => {
      const timer = window.setTimeout(() => setState({ phase: "ready", visible: false, ready: true, progress: 100 }), 0);
      return () => window.clearTimeout(timer);
    };
    if (!checked.current) {
      checked.current = true;
      skipped.current = seenInDocument;
      try {
        skipped.current ||= browserStorage.getItem(storageKey) === "1";
      } catch { /* The in-document guard remains available when storage is blocked. */ }
    }
    if (skipped.current) return settle();
    if (startedAt.current === null) {
      if (requireInteraction && !requested) {
        const timer = window.setTimeout(() => setState({ phase: "entry", visible: false, ready: false, progress: 0 }), 0);
        return () => window.clearTimeout(timer);
      }
      seenInDocument = true;
      try {
        // Persist before opening so a refresh during the intro skips it.
        browserStorage.setItem(storageKey, "1");
      } catch { /* The document guard still prevents repeats when storage is blocked. */ }
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
        phase: complete ? "ready" : "loading",
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
      setState({ phase: "ready", visible: false, ready: true, progress: 100 });
    }, closeAt - now);

    return () => {
      window.clearTimeout(openTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(completeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [requireInteraction, requested]);

  return { ...state, start };
}
