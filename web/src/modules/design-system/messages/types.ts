import type en from "./en";

type MessageShape<T> = {
  [Key in keyof T]: T[Key] extends string ? string : MessageShape<T[Key]>;
};

export type DesignSystemCopy = MessageShape<typeof en>;
