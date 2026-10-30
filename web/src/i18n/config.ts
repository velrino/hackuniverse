export const locales = ["en", "pt-BR"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeQueryKey = "lang";
export const localeRequestHeader = "x-hackuniverse-locale";

export const languageOptions = [
  { locale: "en", label: "English", fullLabel: "English", region: "United States", flag: "🇺🇸" },
  { locale: "pt-BR", label: "Português", fullLabel: "Português (Brasil)", region: "Brasil", flag: "🇧🇷" },
] as const satisfies readonly {
  locale: Locale;
  label: string;
  fullLabel: string;
  region: string;
  flag: string;
}[];

export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function localeFromSearchParams(params: {
  getAll(name: string): string[];
}): Locale {
  const values = params.getAll(localeQueryKey);
  return values.length === 1 ? resolveLocale(values[0]) : defaultLocale;
}

/** Locale propagation applies only to application-root links, never other origins. */
export function withLocale(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return href;
  }

  const url = new URL(href, "https://hackuniverse.invalid");
  url.searchParams.set(localeQueryKey, locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
