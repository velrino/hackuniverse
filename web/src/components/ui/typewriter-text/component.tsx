"use client";

import { cn } from "@/lib/utils";
import { useTypewriterText } from "./use-typewriter-text";
import "./typewriter-text.css";

export type TypewriterTextProps = {
  text: string;
  className?: string;
  delayMs?: number;
  maxDurationMs?: number;
  replayKey?: string | number;
  enabled?: boolean;
};

function TypedText({ text, delayMs, maxDurationMs, enabled }: Required<Pick<TypewriterTextProps, "text" | "delayMs" | "maxDurationMs" | "enabled">>) {
  const visible = useTypewriterText(text, delayMs, maxDurationMs, enabled);
  return <span className="typewriter-text__visible" aria-hidden="true">{visible}</span>;
}

/** The caller owns heading/paragraph semantics; animation never changes its final layout. */
export function TypewriterText({ text, className, delayMs = 25, maxDurationMs = 3500, replayKey, enabled = true }: TypewriterTextProps) {
  const delay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : 25;
  const maximum = Number.isFinite(maxDurationMs) ? Math.max(0, maxDurationMs) : 3500;
  const run = JSON.stringify([text, replayKey, delay, maximum, enabled]);
  return (
    <span className={cn("typewriter-text", className)}>
      <span className="typewriter-text__accessible">{text}</span>
      <span className="typewriter-text__reserve" aria-hidden="true">{text}</span>
      <TypedText key={run} text={text} delayMs={delay} maxDurationMs={maximum} enabled={enabled} />
    </span>
  );
}
