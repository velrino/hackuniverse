import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { NavigationTarget } from "../domain/types";

export type UniverseTourStep = Readonly<{ target: NavigationTarget; holdMs?: number; motion?: "approach" }>;
export type UniverseTourOptions = Readonly<{
  storageKey: string | null;
  steps: readonly UniverseTourStep[];
  ready: boolean;
  enabled?: boolean;
  autoStart?: boolean;
  onStep: (step: UniverseTourStep, token: string) => void;
  onComplete?: () => void;
}>;
export type UniverseTourState = Readonly<{
  phase: "idle" | "waiting" | "arriving" | "holding";
  stepIndex: number;
  currentStep: UniverseTourStep | null;
  token: string | null;
}>;

type Run = {
  storageKey: string;
  steps: readonly UniverseTourStep[];
  sequence: number;
  stepIndex: number;
  phase: "arriving" | "holding";
  token: string;
  deadline: number | null;
};

const idle: UniverseTourState = { phase: "idle", stepIndex: -1, currentStep: null, token: null };
const seenInDocument = new Set<string>();

function hasSeen(key: string) {
  if (seenInDocument.has(key)) return true;
  try {
    if (window.localStorage.getItem(key) === "1") {
      seenInDocument.add(key);
      return true;
    }
  } catch { /* The document guard remains available when storage is blocked. */ }
  return false;
}

function markSeen(key: string) {
  seenInDocument.add(key);
  try { window.localStorage.setItem(key, "1"); }
  catch { /* A blocked storage write must not prevent an explicit tour. */ }
}

function snapshot(run: Run): UniverseTourState {
  return { phase: run.phase, stepIndex: run.stepIndex, currentStep: run.steps[run.stepIndex], token: run.token };
}

/** Arrival acknowledgements start each dwell; navigation and camera work stay with the caller. */
export function useUniverseTour({ storageKey, steps, ready, enabled = true, autoStart = true, onStep, onComplete }: UniverseTourOptions) {
  const instance = useId();
  const [state, setState] = useState<UniverseTourState>(idle);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const run = useRef<Run | null>(null);
  const waiting = useRef<{ storageKey: string; steps: readonly UniverseTourStep[] } | null>(null);
  const cancelledAutoKey = useRef<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef({ storageKey, steps, ready, enabled, autoStart, onStep, onComplete });

  useEffect(() => {
    latest.current = { storageKey, steps, ready, enabled, autoStart, onStep, onComplete };
  }, [storageKey, steps, ready, enabled, autoStart, onStep, onComplete]);

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const stop = useCallback(() => {
    clearTimer();
    run.current = null;
    waiting.current = null;
    if (mounted.current) setState(idle);
  }, [clearTimer]);

  const cancel = useCallback(() => {
    // An early user interruption also cancels an automatic start still awaiting readiness.
    cancelledAutoKey.current = latest.current.storageKey;
    stop();
  }, [stop]);

  const begin = useCallback((preparedSteps?: readonly UniverseTourStep[]) => {
    if (!mounted.current) return;
    const options = latest.current;
    clearTimer();
    run.current = null;
    const source = preparedSteps ?? options.steps;
    if (!options.enabled || !options.storageKey || source.length === 0) { stop(); return; }
    const ownedSteps = source.map((step) => {
      const duration = step.holdMs ?? 0;
      return {
        target: { ...step.target },
        holdMs: Number.isFinite(duration) ? Math.min(0x7fffffff, Math.max(0, duration)) : 0,
        ...(step.motion === "approach" ? { motion: step.motion } : {}),
      };
    });
    if (!options.ready) {
      waiting.current = { storageKey: options.storageKey, steps: ownedSteps };
      setState({ ...idle, phase: "waiting", currentStep: ownedSteps[0] });
      return;
    }
    waiting.current = null;
    const number = ++sequence.current;
    const current: Run = {
      storageKey: options.storageKey, steps: ownedSteps, sequence: number,
      stepIndex: 0, phase: "arriving", token: `${instance}:${number}:0`, deadline: null,
    };
    run.current = current;
    // Persist before requesting the first camera action, including manual replay.
    markSeen(options.storageKey);
    setState(snapshot(current));
    options.onStep(current.steps[0], current.token);
  }, [stop, clearTimer, instance]);

  const advance = useCallback(function advanceStep(token: string) {
    timer.current = null;
    const current = run.current;
    if (!mounted.current || !current || current.token !== token || current.phase !== "holding") return;
    if (!latest.current.ready || !latest.current.enabled || current.storageKey !== latest.current.storageKey) { cancel(); return; }
    const remaining = (current.deadline ?? 0) - performance.now();
    if (remaining > 0) {
      timer.current = window.setTimeout(() => advanceStep(token), remaining);
      return;
    }
    if (current.stepIndex + 1 >= current.steps.length) {
      run.current = null;
      setState(idle);
      latest.current.onComplete?.();
      return;
    }
    current.stepIndex++;
    current.phase = "arriving";
    current.deadline = null;
    current.token = `${instance}:${current.sequence}:${current.stepIndex}`;
    setState(snapshot(current));
    latest.current.onStep(current.steps[current.stepIndex], current.token);
  }, [cancel, instance]);

  const arrive = useCallback((token: string) => {
    const current = run.current;
    if (!mounted.current || !current || current.token !== token || current.phase !== "arriving") return;
    if (!latest.current.ready || !latest.current.enabled) { cancel(); return; }
    const holdMs = current.steps[current.stepIndex].holdMs ?? 0;
    current.phase = "holding";
    current.deadline = performance.now() + holdMs;
    if (holdMs === 0) advance(token);
    else setState(snapshot(current));
  }, [advance, cancel]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimer();
      // Keep the run/deadline for Strict Mode's effect replay; late callbacks are guarded.
    };
  }, [clearTimer]);

  useEffect(() => {
    let current = true;
    // Begin after committed readiness. The guard cancels Strict Mode's discarded setup.
    queueMicrotask(() => {
      if (!current || !mounted.current) return;
      if (!enabled || !storageKey || steps.length === 0) { stop(); return; }
      if (run.current && run.current.storageKey !== storageKey) stop();
      if (waiting.current && waiting.current.storageKey !== storageKey) stop();
      if (!ready) {
        if (run.current) stop();
        return;
      }
      if (!run.current && waiting.current) begin(waiting.current.steps);
      else if (!run.current && autoStart && cancelledAutoKey.current !== storageKey && !hasSeen(storageKey)) begin();
    });
    return () => { current = false; };
  }, [ready, enabled, storageKey, steps, autoStart, begin, stop]);

  useEffect(() => {
    const current = run.current;
    if (state.phase !== "holding" || !current || current.token !== state.token) return;
    const token = current.token;
    const id = window.setTimeout(() => advance(token), Math.max(0, (current.deadline ?? 0) - performance.now()));
    timer.current = id;
    return () => {
      window.clearTimeout(id);
      if (timer.current === id) timer.current = null;
    };
  }, [state.phase, state.token, advance]);

  return { ...state, active: state.phase !== "idle", start: begin, cancel, arrive };
}
