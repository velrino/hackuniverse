"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./styles.css";

export type FloatButtonAction = { id: string; label: string; icon: ReactNode; onSelect: () => void; disabled?: boolean };
export type FloatButtonGroupProps = {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: readonly FloatButtonAction[];
  disabled?: boolean;
  className?: string;
};

/** A disclosed group of ordinary buttons; tab/shift-tab retain native navigation. */
export function FloatButtonGroup({ label, open, onOpenChange, actions, disabled, className = "" }: FloatButtonGroupProps) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, onOpenChange]);
  return <div ref={root} className={`float-button-group ${className}`} onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); onOpenChange(false); trigger.current?.focus(); }
  }}>
    {open && <div id={id} className="float-button-group__actions" role="group" aria-label={label}>
      {actions.map((action) => <Button key={action.id} type="button" variant="outline" className="float-button-group__action" disabled={action.disabled} onClick={() => { onOpenChange(false); action.onSelect(); }}>{action.icon}<span>{action.label}</span></Button>)}
    </div>}
    <Button ref={trigger} type="button" data-dialog-return-focus className="float-button-group__trigger" aria-label={label} aria-expanded={open} aria-controls={open ? id : undefined} disabled={disabled} onClick={() => onOpenChange(!open)}><Plus aria-hidden="true" className={open ? "float-button-group__plus--open" : undefined} /></Button>
  </div>;
}
