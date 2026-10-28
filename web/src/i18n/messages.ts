import en from "./messages/en";
import ptBR from "./messages/pt-BR";
import type { Locale } from "./config";

type MessageShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : MessageShape<T[Key]>;
};

export type Messages = MessageShape<typeof en>;
export type MessageNamespace = keyof Messages;

export const messages = { en, "pt-BR": ptBR } satisfies Record<Locale, Messages>;
