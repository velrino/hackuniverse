import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { UniverseCopy } from "../../messages";

export function WarpCutscene({ destination, copy, onSkip, onCancel }: { destination: string; copy: UniverseCopy; onSkip: () => void; onCancel: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent fullScreen showCloseButton={false} className="universe-warp" onInteractOutside={(event) => event.preventDefault()} onCloseAutoFocus={(event) => { event.preventDefault(); document.querySelector<HTMLButtonElement>(".universe-menu-trigger")?.focus(); }}>
        <div className="universe-warp-rays" aria-hidden="true">{Array.from({ length: 32 }, (_, index) => <span key={index} style={{ "--ray-angle": `${index * 137.508}deg`, "--ray-delay": `${-(index % 8) * .22}s`, "--ray-length": `${60 + (index * 37) % 100}px` } as CSSProperties} />)}</div>
        <div className="universe-warp-core" aria-hidden="true" />
        <div className="universe-warp-copy"><p className="hud-kicker">{copy.travelTo}</p><DialogTitle>{destination}</DialogTitle><DialogDescription>{copy.travelTitle}</DialogDescription></div>
        <div className="universe-warp-actions"><Button variant="ghost" onClick={onCancel}>{copy.travelCancel}</Button><Button variant="outline" className="hud-button" onClick={onSkip}>{copy.travelSkip}</Button></div>
      </DialogContent>
    </Dialog>
  );
}
