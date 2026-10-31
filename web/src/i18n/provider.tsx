"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  isLocale,
  localeFromSearchParams,
  localeQueryKey,
  type Locale,
} from "./config";
import { createFormatters } from "./formatters";
import { messages, type MessageNamespace, type Messages } from "./messages";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  messages: Messages;
  format: ReturnType<typeof createFormatters>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  initialLocale,
  browserLocale,
  children,
}: {
  initialLocale: Locale;
  browserLocale: Locale;
  children: ReactNode;
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const locale = searchParams
    ? localeFromSearchParams(searchParams, browserLocale)
    : initialLocale;

  const setLocale = useCallback((nextLocale: Locale) => {
    if (!isLocale(nextLocale)) return;

    const url = new URL(window.location.href);
    url.searchParams.set(localeQueryKey, nextLocale);

    // Do not pass Next's __NA/_N flags back: they bypass its URL subscription.
    const state = { ...(window.history.state ?? {}) };
    delete state.__NA;
    delete state._N;
    delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
    window.history.replaceState(
      state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = messages[locale].common.pageTitle;
  }, [locale, pathname]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      messages: messages[locale],
      format: createFormatters(locale),
    }),
    [locale, setLocale],
  );

  return <I18nContext value={value}>{children}</I18nContext>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider.");
  return context;
}

export function useTranslations<Namespace extends MessageNamespace>(
  namespace: Namespace,
): Messages[Namespace] {
  return useI18n().messages[namespace];
}
