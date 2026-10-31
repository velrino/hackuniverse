"use client";

import { createContext, useContext, useEffect } from "react";

export const ApplicationIntroReadyContext = createContext(false);
export const ApplicationPreparationContext = createContext<(() => () => void) | null>(null);

/** Hosts report preparation independently of presentation and browser audio activation. */
export function useApplicationPreparation(settled: boolean) {
  const register = useContext(ApplicationPreparationContext);
  useEffect(() => {
    if (!settled) return register?.();
  }, [register, settled]);
}

/** Settles only after the global seen check and any active welcome overlay. */
export function useApplicationIntroReady() {
  return useContext(ApplicationIntroReadyContext);
}
