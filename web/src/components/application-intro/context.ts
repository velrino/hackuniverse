"use client";

import { createContext, useContext } from "react";

export const ApplicationIntroReadyContext = createContext(false);

/** Settles only after the global seen check and any active welcome overlay. */
export function useApplicationIntroReady() {
  return useContext(ApplicationIntroReadyContext);
}
