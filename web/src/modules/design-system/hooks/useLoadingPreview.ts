"use client";

import { useEffect, useState } from "react";
import { useDesignSystemCopy } from "../adapters/hooks/useDesignSystemAdapters";

export function useLoadingPreview() {
  const { loading: copy } = useDesignSystemCopy();
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (!open) return;
    const started = performance.now();
    let finishTimer: number | undefined;
    const timer = window.setInterval(() => {
      const next = Math.min(100, (performance.now() - started) / 50);
      setProgress(next);
      if (next === 100) {
        window.clearInterval(timer);
        finishTimer = window.setTimeout(() => {
          setOpen(false);
          setComplete(true);
        }, 200);
      }
    }, 100);
    return () => { window.clearInterval(timer); window.clearTimeout(finishTimer); };
  }, [open]);

  return {
    copy, open, progress, complete,
    onStart: () => { setProgress(0); setComplete(false); setOpen(true); },
    onCancel: () => setOpen(false),
  };
}
