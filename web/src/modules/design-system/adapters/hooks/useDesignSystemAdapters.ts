"use client";

import { useContext } from "react";
import { AdaptersContext } from "../context/AdaptersContext";

export function useDesignSystemAdapters() {
  const adapters = useContext(AdaptersContext);
  if (!adapters) throw new Error("Design system adapters are not mounted.");
  return adapters;
}

export function useDesignSystemCopy() {
  return useDesignSystemAdapters().localization.copy;
}
