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

export function useApplicationIntro({ requireInteraction = false, preparationReady = true }: { requireInteraction?: boolean; preparationReady?: boolean } = {}) {
  const [state, setState] = useState<IntroState>({ phase: "checking", visible: false, ready: false, progress: 0 });
  const [requested, setRequested] = useState(false);
  const checked = useRef(false);
  const skipped = useRef(false);
  const startedAt = useRef<number | null>(null);
  const released = useRef(false);
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
    if (skipped.current || released.current) return settle();
    if (startedAt.current === null) {
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
    const updateProgress = (animationComplete = false) => {
      const current = performance.now();
      const elapsed = Math.max(0, current - start);
      const complete = (animationComplete || current >= closeAt) && preparationReady;
      const phase = !complete ? "loading" : requireInteraction && !requested ? "entry" : "ready";
      if (phase === "ready") released.current = true;
      setState({
        phase,
        visible: !complete,
        ready: phase === "ready",
        progress: Math.min(100, elapsed / durationMs * 100),
      });
    };
    const openTimer = window.setTimeout(() => {
      updateProgress();
    }, 0);
    // Once the animation finishes, real preparation owns the remaining wait.
    // A readiness or interaction change re-evaluates this without restarting it.
    if (now >= closeAt) return () => window.clearTimeout(openTimer);
    const progressTimer = window.setInterval(() => updateProgress(), progressIntervalMs);
    const completeTimer = window.setTimeout(() => {
      window.clearInterval(progressTimer);
      updateProgress();
    }, Math.max(0, Math.ceil(deadline - now)));
    // Leave one short completion frame so 100% is visible before releasing the tour.
    const closeTimer = window.setTimeout(() => {
      window.clearInterval(progressTimer);
      updateProgress(true);
    }, Math.ceil(closeAt - now));

    return () => {
      window.clearTimeout(openTimer);
      window.clearInterval(progressTimer);
      window.clearTimeout(completeTimer);
      window.clearTimeout(closeTimer);
    };
  }, [requireInteraction, requested, preparationReady]);

  return { ...state, waitingForPreparation: state.progress >= 100 && !preparationReady, start };
}
