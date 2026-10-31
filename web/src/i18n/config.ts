export const locales = ["en", "pt-BR", "fil"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const localeQueryKey = "lang";
export const localeRequestHeader = "x-hackuniverse-locale";

export const languageOptions = [
  { locale: "en", shortLabel: "EN", label: "English", fullLabel: "English", region: "United States", flag: "🇺🇸" },
  { locale: "pt-BR", shortLabel: "PT", label: "Português", fullLabel: "Português (Brasil)", region: "Brasil", flag: "🇧🇷" },
  { locale: "fil", shortLabel: "FIL", label: "Filipino", fullLabel: "Filipino", region: "Pilipinas", flag: "🇵🇭" },
] as const satisfies readonly {
  locale: Locale;
  shortLabel: string;
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

/** Browser language ranges may include regions and the legacy Tagalog tag. */
export function localeFromLanguages(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/.test(tag)) continue;
    const base = tag.split("-")[0];
    if (base === "fil" || base === "tl") return "fil";
    if (base === "pt") return "pt-BR";
    if (base === "en") return "en";
  }
  return defaultLocale;
}

/** Negotiate before rendering so browser detection never causes a locale flash. */
export function localeFromAcceptLanguage(header: string | null): Locale {
  const preferred = (header ?? "").split(",").map((range) => {
    const [tag, ...parameters] = range.trim().split(";");
    const quality = parameters.find((parameter) => /^q=/i.test(parameter.trim()));
    const weight = quality === undefined ? 1 : Number(quality.trim().slice(2));
    return { tag, weight };
  }).filter(({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1)
    .sort((a, b) => b.weight - a.weight);
  return localeFromLanguages(preferred.map(({ tag }) => tag));
}

export function localeFromSearchParams(params: {
  getAll(name: string): string[];
}, browserLocale: Locale = defaultLocale): Locale {
  const values = params.getAll(localeQueryKey);
  if (values.length === 0) return browserLocale;
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
