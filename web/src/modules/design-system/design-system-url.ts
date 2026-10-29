import type { Locale } from "@/i18n/config";

/** The shared documentation is a separate site; product components stay local. */
export function designSystemUrl(locale: Locale): string {
  const url = new URL("https://velrino.github.io/velrino-ui/");
  url.searchParams.set("lang", locale);
  url.searchParams.set("theme", "cyan");
  url.searchParams.set("appearance", "sci-fi");
  return url.href;
}
