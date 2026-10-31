"use client";

import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { defaultLocale, localeFromLanguages, localeFromSearchParams, withLocale, type Locale } from "@/i18n/config";
import "./runtime-error.css";

const copy = {
  en: {
    eyebrow: "Unexpected interruption",
    title: "Unable to display this page.",
    description: "Something interrupted this page. Try again or return to the universe.",
    retry: "Try again",
    home: "Return to the universe",
  },
  "pt-BR": {
    eyebrow: "Interrupção inesperada",
    title: "Não foi possível exibir esta página.",
    description: "Algo interrompeu esta página. Tente novamente ou volte ao universo.",
    retry: "Tentar novamente",
    home: "Voltar ao universo",
  },
  fil: {
    eyebrow: "Hindi inaasahang pagkakaantala",
    title: "Hindi maipakita ang pahinang ito.",
    description: "May humadlang sa pahinang ito. Subukang muli o bumalik sa uniberso.",
    retry: "Subukang muli",
    home: "Bumalik sa uniberso",
  },
} satisfies Record<Locale, { eyebrow: string; title: string; description: string; retry: string; home: string }>;

function readLocale() {
  return localeFromSearchParams(new URLSearchParams(window.location.search), localeFromLanguages(navigator.languages));
}

function subscribeLocale(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener("hashchange", onChange);
  // The normal shell changes its document language after same-document locale
  // updates. Observe it without depending on the provider that may have failed.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener("hashchange", onChange);
    observer.disconnect();
  };
}

/** Also works when the root layout and its localization provider have failed. */
export function useRuntimeErrorLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, readLocale, () => defaultLocale);
}

export function RuntimeErrorPage({ retry, locale }: { retry: () => void; locale: Locale }) {
  const text = copy[locale];
  return (
    <main className="runtime-error-page" aria-labelledby="runtime-error-title" lang={locale}>
      <Panel as="div" className="runtime-error-panel">
        <p className="hud-kicker">{text.eyebrow}</p>
        <h1 id="runtime-error-title" className="hud-title runtime-error-title">{text.title}</h1>
        <p className="runtime-error-description">{text.description}</p>
        <div className="runtime-error-actions">
          <Button type="button" variant="outline" className="hud-button" onClick={retry}>{text.retry}</Button>
          <Button asChild variant="ghost" className="hud-button"><a href={withLocale("/", locale)}>{text.home}</a></Button>
        </div>
      </Panel>
    </main>
  );
}
