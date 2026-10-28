"use client";

import { useDesignSystemAdapters } from "../../adapters/hooks/useDesignSystemAdapters";
import { colorTokens, sectionOrder, type ShowcaseMode, type ShowcaseSectionId } from "../../configs/showcase";
import type { ReactNode } from "react";
import { DesignSection } from "../../ui/base/design-section";
import { ButtonShowcase, DialogShowcase, InputShowcase, LoadingShowcase } from "./interactive-examples";

export function Showcase({ mode, activeSection }: { mode: ShowcaseMode; activeSection: ShowcaseSectionId }) {
  const { localization: { copy }, components: { BrandLogo }, brand } = useDesignSystemAdapters();
  const content: Record<ShowcaseSectionId, ReactNode> = {
    principles: (
      <ul className="grid gap-5 text-sm leading-7 text-[var(--hud-muted)] md:grid-cols-3">
        <li>{copy.principles.interaction}</li>
        <li>{copy.principles.readability}</li>
        <li>{copy.principles.density}</li>
      </ul>
    ),
    colors: (
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {colorTokens.map((token) => (
          <div key={token.variable} className="min-w-0">
            <div aria-hidden="true" className="mb-3 h-20 border border-[var(--hud-line)]" style={{ backgroundColor: `var(${token.variable})` }} />
            <h3 className="text-sm font-medium">{copy.colors[token.key]}</h3>
            <code className="mt-1 block break-all text-xs leading-6 text-[var(--hud-muted)]">{token.variable}</code>
          </div>
        ))}
      </div>
    ),
    typography: (
      <div className="grid gap-8">
        <div>
          <h3 className="mb-3 font-mono text-xs text-[var(--hud-muted)]">{copy.typography.headingLabel} / <code>.hud-title</code></h3>
          <p className="hud-title max-w-2xl text-3xl sm:text-4xl">{copy.typography.headingSample}</p>
        </div>
        <div>
          <h3 className="mb-3 font-mono text-xs text-[var(--hud-muted)]">{copy.typography.bodyLabel}</h3>
          <p className="max-w-2xl text-base leading-8">{copy.typography.bodySample}</p>
        </div>
        <div className="grid gap-8 sm:grid-cols-2">
          <div>
            <h3 className="mb-3 font-mono text-xs text-[var(--hud-muted)]">{copy.typography.kickerLabel} / <code>.hud-kicker</code></h3>
            <p className="hud-kicker">{copy.typography.kickerSample}</p>
          </div>
          <div>
            <h3 className="mb-3 font-mono text-xs text-[var(--hud-muted)]">{copy.typography.monoLabel}</h3>
            <code className="text-sm">--hud-accent / 0123456789</code>
          </div>
        </div>
      </div>
    ),
    buttons: (
      <ButtonShowcase />
    ),
    inputs: (
      <InputShowcase />
    ),
    dialogs: (
      <DialogShowcase />
    ),
    loading: (
      <LoadingShowcase />
    ),
    brand: (
      <div className="flex flex-wrap items-center gap-6">
        <BrandLogo alt={copy.brand.wordmark} size={96} className="size-24 object-contain" />
        <div className="max-w-xl">
          <p className="text-lg font-semibold tracking-wider uppercase">{brand.name}</p>
          <p className="mt-3 text-sm leading-7 text-[var(--hud-muted)]">{copy.brand.rule}</p>
        </div>
      </div>
    ),
  };
  return sectionOrder.map((id) => (
    <DesignSection key={id} id={id} title={copy.sections[id]} description={copy[id].description} tabbed={mode === "tabs"} active={activeSection === id}>
      {content[id]}
    </DesignSection>
  ));
}
