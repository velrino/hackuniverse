import en from "./en";
import ptBR from "./pt-BR";
import type { AudioCopy } from "./types";
export function getAudioCopy(locale: "en" | "pt-BR"): AudioCopy { return locale === "pt-BR" ? ptBR : en; }
