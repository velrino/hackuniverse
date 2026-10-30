import type en from "./en";
type Shape<T> = { [Key in keyof T]: T[Key] extends string ? string : Shape<T[Key]> };
export type AudioCopy = Shape<typeof en>;
