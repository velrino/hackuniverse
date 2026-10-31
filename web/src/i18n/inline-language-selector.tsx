"use client";

import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { languageOptions } from "./config";
import { useI18n, useTranslations } from "./provider";

/** Direct language choices for settings panels that already provide a container. */
export function InlineLanguageSelector() {
  const { locale, setLocale } = useI18n();
  const common = useTranslations("common");

  return (
    <div role="group" aria-label={common.changeLanguage} className="grid grid-cols-1 gap-2">
      {languageOptions.map((option) => {
        const selected = option.locale === locale;

        return (
          <Button
            key={option.locale}
            type="button"
            variant="outline"
            aria-label={option.fullLabel}
            aria-pressed={selected}
            data-selected={selected}
            onClick={() => setLocale(option.locale)}
            className="hud-option h-auto min-h-12 w-full min-w-0 justify-start gap-2 rounded-none px-3 py-3 text-left font-normal"
          >
            <span aria-hidden="true" className="shrink-0 text-xl leading-none">{option.flag}</span>
            <span lang={option.locale} className="min-w-0 flex-1 text-xs leading-5 whitespace-normal">{option.fullLabel}</span>
            <span aria-hidden="true" className="grid size-4 shrink-0 place-items-center text-[var(--hud-accent)]">
              {selected && <Check className="size-3.5" />}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
