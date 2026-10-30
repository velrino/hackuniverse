"use client";

import { createContext, useContext } from "react";

export type IdentityDialogControls = {
  openLogin: () => void;
  closeLogin: () => void;
  isOpen: boolean;
};

export const IdentityDialogContext = createContext<IdentityDialogControls | null>(null);

export function useIdentityDialog(): IdentityDialogControls {
  const context = useContext(IdentityDialogContext);
  if (!context) throw new Error("useIdentityDialog must be used inside IdentityProvider.");
  return context;
}
