"use client";

import { useState } from "react";
import { useDesignSystemCopy } from "../adapters/hooks/useDesignSystemAdapters";

export function useInputExample() {
  const { inputs: copy } = useDesignSystemCopy();
  const [value, onValueChange] = useState("ab");
  return { copy, value, onValueChange, invalid: value.trim().length < 3 };
}
