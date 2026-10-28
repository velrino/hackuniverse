import type en from "./en";

type CopyShape<T> = { [Key in keyof T]: T[Key] extends string ? string : CopyShape<T[Key]> };
export type UniverseCopy = CopyShape<typeof en>;
