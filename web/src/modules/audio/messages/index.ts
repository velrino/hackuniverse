import en from "./en";
import ptBR from "./pt-BR";
import fil from "./fil";
import type { Locale } from "@/i18n/config";
import type { AudioCopy } from "./types";

const messages = { en, "pt-BR": ptBR, fil } satisfies Record<Locale, AudioCopy>;

export function getAudioCopy(locale: Locale): AudioCopy { return messages[locale]; }
