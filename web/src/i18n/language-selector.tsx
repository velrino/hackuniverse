"use client";

import { useRef } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { languageOptions } from "./config";
import { useI18n, useTranslations } from "./provider";

export function LanguageSelector() {
  const { locale, setLocale } = useI18n();
  const common = useTranslations("common");
  const copy = useTranslations("languageDialog");
  const selectedOptionRef = useRef<HTMLButtonElement>(null);
  const current = languageOptions.find((option) => option.locale === locale);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="hud-button min-h-11 gap-2 rounded-none px-3 font-mono text-xs"
          aria-label={`${common.changeLanguage}: ${current?.label}`}
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {current?.flag}
          </span>
          <span>{current?.shortLabel}</span>
          <ChevronDown aria-hidden="true" className="size-3 text-[var(--hud-accent)]" />
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={common.close}
        className="gap-0 rounded-none p-0 sm:max-w-[500px] [&>[data-slot=dialog-close]]:top-2 [&>[data-slot=dialog-close]]:right-2 [&>[data-slot=dialog-close]]:grid [&>[data-slot=dialog-close]]:size-11 [&>[data-slot=dialog-close]]:place-items-center [&>[data-slot=dialog-close]]:text-[var(--hud-accent)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          selectedOptionRef.current?.focus();
        }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <div className="px-4 py-10 sm:px-7">
          <p className="hud-kicker mb-4">{common.changeLanguage}</p>
          <DialogHeader className="gap-3 text-left">
            <DialogTitle className="hud-title text-2xl leading-tight sm:text-[28px]">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[var(--hud-muted)]">
              {copy.description}
            </DialogDescription>
          </DialogHeader>
          <div aria-hidden="true" className="hud-rule mt-6" />
          <div className="mt-7 grid grid-cols-1 gap-3">
            {languageOptions.map((option) => {
              const selected = option.locale === locale;

              return (
                <Button
                  key={option.locale}
                  ref={selected ? selectedOptionRef : undefined}
                  type="button"
                  variant="ghost"
                  aria-label={option.label}
                  aria-pressed={selected}
                  data-selected={selected}
                  onClick={() => setLocale(option.locale)}
                  className="hud-option grid h-auto min-h-[78px] w-full min-w-0 grid-cols-[32px_minmax(0,1fr)_24px] gap-3 rounded-none px-4 py-4 text-left font-normal"
                >
                  <span aria-hidden="true" className="text-[28px] leading-none">
                    {option.flag}
                  </span>
                  <span className="grid min-w-0 gap-1">
                    <span lang={option.locale} className="text-sm font-semibold tracking-wider uppercase">
                      {option.label}
                    </span>
                    <span className="font-mono text-[9px] tracking-[0.12em] whitespace-normal text-[var(--hud-muted)] uppercase">
                      {selected ? copy.current : copy.choose}
                    </span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="grid size-6 place-items-center border border-[var(--hud-line)] text-[var(--hud-accent)]"
                  >
                    {selected && <Check className="size-3.5" />}
                  </span>
                </Button>
              );
            })}
          </div>
          <p className="mt-6 font-mono text-[11px] leading-6 text-[var(--hud-muted)]">
            {copy.hint}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
