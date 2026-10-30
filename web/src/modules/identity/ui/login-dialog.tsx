"use client";

import { useId, useState, type FormEvent } from "react";
import { Eye, EyeOff, Info, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDialogReturnFocus, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/i18n";
import "./login-dialog.css";

export type LoginDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Presentation preview only; closing unmounts all credential fields. */
export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const copy = useTranslations("identity");
  const focusReturn = useDialogReturnFocus();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="identity-login-dialog"
        closeLabel={copy.close}
        {...focusReturn}
      >
        <DialogHeader>
          <p className="hud-kicker identity-login-eyebrow"><LogIn size={14} aria-hidden="true" />{copy.eyebrow}</p>
          <DialogTitle className="hud-title">{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        {open && <LoginPreviewForm />}
      </DialogContent>
    </Dialog>
  );
}

function LoginPreviewForm() {
  const copy = useTranslations("identity");
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState<"google" | "email" | null>(null);
  const previewId = `${id}-preview`;
  const emailId = `${id}-email`;
  const passwordId = `${id}-password`;

  const previewEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPassword("");
    setShowPassword(false);
    setNotice("email");
  };

  return (
    <div className="identity-login-body">
      <p id={previewId} className="identity-login-preview" role="note"><Info size={16} aria-hidden="true" /><span>{copy.preview}</span></p>
      <Button type="button" variant="outline" className="identity-login-action" aria-describedby={previewId} onClick={() => setNotice("google")}>
        <span className="identity-google-mark" aria-hidden="true">G</span>{copy.google}
      </Button>
      <div className="identity-login-divider"><span />{copy.or}<span /></div>
      <form className="identity-login-form" autoComplete="off" aria-describedby={previewId} onSubmit={previewEmail}>
        <div className="identity-login-field">
          <label htmlFor={emailId}>{copy.email}</label>
          <Input id={emailId} type="email" inputMode="email" autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={254} required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={copy.emailPlaceholder} />
        </div>
        <div className="identity-login-field">
          <label htmlFor={passwordId}>{copy.password}</label>
          <div className="identity-login-password">
            <Input id={passwordId} type={showPassword ? "text" : "password"} autoComplete="off" maxLength={256} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={copy.passwordPlaceholder} />
            <Button type="button" variant="ghost" size="icon" aria-controls={passwordId} aria-label={showPassword ? copy.hidePassword : copy.showPassword} aria-pressed={showPassword} onClick={() => setShowPassword((shown) => !shown)}>
              {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
            </Button>
          </div>
        </div>
        <Button type="submit" className="identity-login-action" disabled={!email.trim() || !password}>{copy.emailAction}</Button>
      </form>
      <p className="identity-login-status" role="status" aria-live="polite" aria-atomic="true">{notice === "google" ? copy.googleNotice : notice === "email" ? copy.emailNotice : ""}</p>
    </div>
  );
}
