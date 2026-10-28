"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

let motionQuery: MediaQueryList | null = null;
function getMotionQuery() {
  if (!motionQuery && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return motionQuery;
}
function subscribeMotion(notify: () => void) {
  const query = getMotionQuery();
  query?.addEventListener("change", notify);
  return () => query?.removeEventListener("change", notify);
}
const motionSnapshot = () => getMotionQuery()?.matches ?? false;
const serverMotionSnapshot = () => false;

/** The fallback preserves common combining marks, joined emoji and flag pairs. */
export function segmentTypewriterText(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), ({ segment }) => segment);
  }
  const segments: string[] = [];
  let regionalCount = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    const regional = point >= 0x1f1e6 && point <= 0x1f1ff;
    const previous = segments[segments.length - 1];
    const joined = previous && (character === "\u200d" || previous.endsWith("\u200d") || /\p{Mark}/u.test(character) ||
      point >= 0x1f3fb && point <= 0x1f3ff || regional && regionalCount % 2 === 1 || character === "\n" && previous.endsWith("\r"));
    if (joined) segments[segments.length - 1] += character;
    else segments.push(character);
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return segments;
}

export function useTypewriterText(text: string, delayMs: number, maxDurationMs: number, enabled: boolean) {
  const segments = useMemo(() => segmentTypewriterText(text), [text]);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionSnapshot, serverMotionSnapshot);
  const [shown, setShown] = useState(0);
  const startedAt = useRef<number | null>(null);
  const duration = Math.min(segments.length * delayMs, maxDurationMs);

  useEffect(() => {
    if (!enabled || duration <= 0 || segments.length === 0) return;
    if (reducedMotion) {
      const complete = window.setTimeout(() => setShown(segments.length), 0);
      return () => window.clearTimeout(complete);
    }
    if (startedAt.current === null) startedAt.current = performance.now();
    const start = startedAt.current;
    let cancelled = false;
    let timer: number;
    const tick = () => {
      if (cancelled) return;
      const elapsed = Math.max(0, performance.now() - start);
      const count = Math.min(segments.length, Math.floor(elapsed / duration * segments.length));
      setShown((previous) => Math.max(previous, count));
      if (count < segments.length) timer = window.setTimeout(tick, Math.min(32, Math.max(1, duration - elapsed)));
    };
    timer = window.setTimeout(tick, 0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [duration, enabled, reducedMotion, segments]);

  return !enabled || reducedMotion || duration <= 0 ? text : segments.slice(0, shown).join("");
}
