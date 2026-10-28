"use client";

import { useState } from "react";
import { useDesignSystemAdapters } from "../adapters/hooks/useDesignSystemAdapters";

export function useDialogExample() {
  const { localization, components } = useDesignSystemAdapters();
  const [open, onOpenChange] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  return {
    copy: localization.copy.dialogs,
    closeLabel: localization.closeLabel,
    LanguagePicker: components.LanguagePicker,
    open, confirmed, onOpenChange,
    onConfirm: () => { setConfirmed(true); onOpenChange(false); },
  };
}
