"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useDialogReturnFocus, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { UniverseEntity } from "../../../universe/domain";
import type { WorkspaceCopy } from "../../messages";
import "./editor.css";

export type DeleteEntityDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity: UniverseEntity;
  count: number;
  copy: WorkspaceCopy;
  busy: boolean;
  storageBlocked?: boolean;
  onConfirm: () => void;
  error?: string;
};

export function DeleteEntityDialog({ open, onOpenChange, entity, count, copy, busy, storageBlocked, onConfirm, error }: DeleteEntityDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);
  const focusReturn = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) onOpenChange(next); }}>
      <DialogContent {...focusReturn} className="workspace-delete-dialog" closeLabel={copy.close} showCloseButton={!busy} onOpenAutoFocus={(event) => { focusReturn.onOpenAutoFocus(); event.preventDefault(); cancel.current?.focus(); }}>
        <DialogHeader>
          <DialogTitle className="hud-title">{copy.deleteTitle}</DialogTitle>
          <DialogDescription>{copy.deleteDescription}</DialogDescription>
        </DialogHeader>
        <div className="workspace-delete-summary">
          <p className="hud-kicker">{copy.kinds[entity.kind]}</p>
          <p className="workspace-delete-name">{entity.name}</p>
          <p>{count > 1 ? copy.deleteMany.replace("{count}", String(count)) : copy.deleteOne}</p>
        </div>
        {error && <p className="workspace-editor-error" role="alert">{error}</p>}
        <DialogFooter>
          <Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{copy.cancel}</Button>
          <Button type="button" variant="destructive" disabled={busy || storageBlocked} onClick={onConfirm}>{busy ? copy.destroying : copy.deleteConfirm}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
