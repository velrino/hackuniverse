"use client";

import { useState } from "react";
import { useDesignSystemCopy } from "../adapters/hooks/useDesignSystemAdapters";

export function useButtonExamples() {
  const { buttons: copy } = useDesignSystemCopy();
  const [action, onAction] = useState<string | null>(null);
  const [selected, setSelected] = useState(true);
  return { copy, action, selected, onAction, onToggle: () => setSelected((value) => !value) };
}
