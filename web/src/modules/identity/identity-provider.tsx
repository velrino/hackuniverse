"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { IdentityDialogContext } from "./hooks/use-identity-dialog";
import { LoginDialog } from "./ui/login-dialog";

export function IdentityProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const openLogin = useCallback(() => setIsOpen(true), []);
  const closeLogin = useCallback(() => setIsOpen(false), []);
  const controls = useMemo(() => ({ openLogin, closeLogin, isOpen }), [openLogin, closeLogin, isOpen]);

  return (
    <IdentityDialogContext value={controls}>
      {children}
      <LoginDialog open={isOpen} onOpenChange={setIsOpen} />
    </IdentityDialogContext>
  );
}
