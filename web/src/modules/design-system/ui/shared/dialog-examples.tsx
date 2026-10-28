"use client";

import type { ComponentType } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { DesignSystemCopy } from "../../messages";

type DialogExamplesProps = {
  copy: DesignSystemCopy["dialogs"];
  closeLabel: string;
  open: boolean;
  confirmed: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  LanguagePicker: ComponentType;
};

export function DialogExamples({ copy, closeLabel, open, confirmed, onOpenChange, onConfirm, LanguagePicker }: DialogExamplesProps) {
  return (
    <div className="grid gap-8">
      <div>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild>
            <Button type="button"><MessageSquare aria-hidden="true" />{copy.open}</Button>
          </DialogTrigger>
          <DialogContent
            closeLabel={closeLabel} className="hud-panel hud-panel--dialog p-7 pt-12 sm:p-9 sm:pt-12"
            onInteractOutside={(event) => event.preventDefault()}
          >
            <DialogHeader className="text-left">
              <DialogTitle className="hud-title text-2xl leading-tight">{copy.title}</DialogTitle>
              <DialogDescription className="leading-7 text-[var(--hud-muted)]">{copy.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-5 gap-3">
              <DialogClose asChild><Button type="button" variant="outline">{copy.cancel}</Button></DialogClose>
              <Button type="button" onClick={onConfirm}>{copy.confirm}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm text-[var(--hud-muted)]">
          {confirmed ? copy.confirmed : null}
        </p>
      </div>
      <div className="hud-rule" aria-hidden="true" />
      <div className="flex flex-wrap items-center justify-between gap-5">
        <div className="max-w-lg">
          <h3 className="hud-kicker mb-2">{copy.languageTitle}</h3>
          <p className="text-sm leading-7 text-[var(--hud-muted)]">{copy.languageDescription}</p>
        </div>
        <LanguagePicker />
      </div>
    </div>
  );
}
