import en from "./en";
import ptBR from "./pt-BR";
import type { WorkspaceCopy } from "./types";

export type { WorkspaceCopy } from "./types";

export function getWorkspaceCopy(locale: "en" | "pt-BR"): WorkspaceCopy {
  return locale === "pt-BR" ? ptBR : en;
}
