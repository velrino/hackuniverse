import type { Locale } from "./config";

export function createFormatters(locale: Locale) {
  const number = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(locale, options).format(value);

  const dateTime = (
    value: Date | number,
    options?: Intl.DateTimeFormatOptions,
  ) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...options }).format(value);

  const plural = (
    count: number,
    forms: { one: string; other: string },
  ) => {
    const category = new Intl.PluralRules(locale).select(count);
    return forms[category === "one" ? "one" : "other"].replaceAll(
      "{count}",
      number(count),
    );
  };

  return { number, dateTime, plural };
}
