"use client";

import { Check, LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnchorLink } from "@/components/ui/anchor-link";
import { buttonSizes, buttonVariants } from "../../configs/showcase";

import type { DesignSystemCopy } from "../../messages";

type ButtonExamplesProps = {
  copy: DesignSystemCopy["buttons"];
  action: string | null;
  selected: boolean;
  onAction: (action: string) => void;
  onToggle: () => void;
};

export function ButtonExamples({ copy, action, selected, onAction, onToggle }: ButtonExamplesProps) {
  return (
    <div className="grid gap-8">
      <div>
        <h3 className="hud-kicker mb-4">{copy.variantsLabel}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {buttonVariants.map((variant) => (
            <Button key={variant} type="button" variant={variant} onClick={() => onAction(variant)}>
              {variant}
            </Button>
          ))}
          <Button asChild variant="link"><AnchorLink href="#typography">link</AnchorLink></Button>
        </div>
      </div>
      <div>
        <h3 className="hud-kicker mb-4">{copy.sizesLabel}</h3>
        <div className="flex flex-wrap items-center gap-3">
          {buttonSizes.map((size) => (
            <Button key={size} type="button" variant="outline" size={size} onClick={() => onAction(size)}>
              {size}
            </Button>
          ))}
          <Button type="button" size="icon" aria-label={copy.iconLabel} onClick={() => onAction("icon")}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div>
        <h3 className="hud-kicker mb-4">{copy.statesLabel}</h3>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={() => onAction("normal")}>{copy.normal}</Button>
          <Button
            type="button" variant="ghost" className="hud-option" data-selected={selected}
            aria-pressed={selected} onClick={onToggle}
          >
            {selected && <Check aria-hidden="true" />}
            {copy.selected}
          </Button>
          <Button type="button" disabled>{copy.disabled}</Button>
          <Button type="button" disabled aria-busy="true">
            <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
            {copy.loading}
          </Button>
        </div>
      </div>
      <p role="status" aria-live="polite" className="min-h-6 text-sm text-[var(--hud-muted)]">
        {action ? copy.feedback.replace("{variant}", action) : copy.interactionHint}
      </p>
    </div>
  );
}
