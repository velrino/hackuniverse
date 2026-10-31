import type { Locale } from "@/i18n/config";
import en from "./en";
import ptBR from "./pt-BR";
import fil from "./fil";
import type { WorkspaceCopy } from "./types";

export type { WorkspaceCopy } from "./types";

const messages = { en, "pt-BR": ptBR, fil } satisfies Record<Locale, WorkspaceCopy>;

export function getWorkspaceCopy(locale: Locale): WorkspaceCopy {
  return messages[locale];
}
