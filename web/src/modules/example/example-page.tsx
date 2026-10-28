"use client";

import { useTranslations } from "@/i18n";
import { HudPanel } from "@/components/ui/hud-panel";

export function ExamplePage() {
  const copy = useTranslations("example");

  return (
    <main className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-24">
      <HudPanel className="px-6 py-9 sm:px-10 sm:py-12">
        <div className="mb-7 flex items-center justify-between gap-4">
          <p className="hud-kicker">{copy.eyebrow}</p>
          <div aria-hidden="true" className="flex gap-1.5">
            <span className="size-1 bg-[var(--hud-accent)]" />
            <span className="size-1 bg-[var(--hud-accent)] opacity-60" />
            <span className="size-1 bg-[var(--hud-accent)] opacity-30" />
          </div>
        </div>
        <h1 className="hud-title max-w-2xl text-4xl leading-[1.12] sm:text-5xl">
          {copy.title}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-7 text-[var(--hud-muted)] sm:text-lg">
          {copy.description}
        </p>
        <div aria-hidden="true" className="hud-rule mt-8" />
        <div className="mt-8">
          <label htmlFor="example-note" className="hud-kicker mb-3 block">
            {copy.noteLabel}
          </label>
          <input
            id="example-note"
            type="text"
            placeholder={copy.notePlaceholder}
            aria-describedby="example-note-hint"
            className="hud-input min-h-12 w-full px-4 py-3 text-base"
          />
          <p
            id="example-note-hint"
            className="mt-3 font-mono text-xs leading-6 text-[var(--hud-muted)]"
          >
            {copy.noteHint}
          </p>
        </div>
      </HudPanel>
    </main>
  );
}
