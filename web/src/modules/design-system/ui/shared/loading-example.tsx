"use client";

import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullScreenLoader } from "@/components/ui/full-screen-loader";
import type { DesignSystemCopy } from "../../messages";

type LoadingExampleProps = {
  copy: DesignSystemCopy["loading"];
  open: boolean;
  progress: number;
  complete: boolean;
  onStart: () => void;
  onCancel: () => void;
};

export function LoadingExample({ copy, open, progress, complete, onStart, onCancel }: LoadingExampleProps) {
  return (
    <div>
      <Button type="button" onClick={onStart}>
        <Play aria-hidden="true" />{copy.open}
      </Button>
      <p role="status" aria-live="polite" className="mt-4 min-h-6 text-sm text-[var(--hud-muted)]">
        {complete ? copy.complete : null}
      </p>
      {open && (
        <FullScreenLoader
          progress={progress} label={copy.label} detail={copy.detail}
          onCancel={onCancel} cancelLabel={copy.cancel}
        />
      )}
    </div>
  );
}
