"use client";

import type { DesignSystemCopy } from "../../messages";

type InputExamplesProps = {
  copy: DesignSystemCopy["inputs"];
  value: string;
  invalid: boolean;
  onValueChange: (value: string) => void;
};

export function InputExamples({ copy, value, invalid, onValueChange }: InputExamplesProps) {
  return (
    <div className="grid gap-7 md:grid-cols-2">
      <div>
        <label className="hud-kicker mb-3 block" htmlFor="ds-normal">{copy.normalLabel}</label>
        <input id="ds-normal" className="hud-input min-h-12 w-full px-4 py-3" placeholder={copy.placeholder} aria-describedby="ds-normal-hint" />
        <p id="ds-normal-hint" className="mt-3 text-sm leading-6 text-[var(--hud-muted)]">{copy.normalHint}</p>
      </div>
      <div>
        <label className="hud-kicker mb-3 block" htmlFor="ds-validation">{copy.errorLabel}</label>
        <input
          id="ds-validation" className="hud-input min-h-12 w-full px-4 py-3"
          value={value} onChange={(event) => onValueChange(event.target.value)}
          minLength={3} aria-invalid={invalid} aria-describedby="ds-validation-hint"
        />
        <p
          id="ds-validation-hint" role="status" aria-live="polite"
          className={`mt-3 text-sm leading-6 ${invalid ? "text-destructive" : "text-[var(--hud-muted)]"}`}
        >
          {invalid ? copy.errorHint : copy.validHint}
        </p>
      </div>
      <div>
        <label className="hud-kicker mb-3 block" htmlFor="ds-disabled">{copy.disabledLabel}</label>
        <input id="ds-disabled" className="hud-input min-h-12 w-full px-4 py-3" value={copy.disabledValue} disabled />
      </div>
    </div>
  );
}
