"use client";

import { useRef } from "react";

/** Controlled dialogs may have no Radix trigger, or their opener can disappear. */
export function useDialogReturnFocus() {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus() {
      opener.current = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    },
    onCloseAutoFocus(event: Event) {
      event.preventDefault();
      const previous = opener.current;
      opener.current = null;
      requestAnimationFrame(() => {
        // Switching between dialogs must not steal the new dialog's focus.
        if (document.querySelector('[data-slot="dialog-content"]')) return;
        const fallback = document.querySelector<HTMLElement>('[data-dialog-return-focus]:not([disabled])');
        (previous?.isConnected ? previous : fallback)?.focus({ preventScroll: true });
      });
    },
  };
}
