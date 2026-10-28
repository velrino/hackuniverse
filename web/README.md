# HackUniverse web

Next.js App Router, React, TypeScript and Tailwind CSS, with shadcn/ui Button and Dialog primitives. `/` and `/example` share a small translated example and the global language dialog. The catalog, 3D universe and account dashboard remain planned work.

The approved transparent logo is stored at `../assets/images/logo.png`, served from `public/brand/logo.png`, and displayed in the shared header. App Router serves the generated `src/app/favicon.ico` and `src/app/icon.png` automatically.

## Visual system

The interface uses a cyan science-fiction HUD theme. `src/styles/hud.css` owns the `--hud-*` tokens, their shadcn color mappings and shared HUD styles; `src/app/globals.css` handles Tailwind integration. Use `HudPanel` from `@/components/ui/hud-panel` for reusable cut-corner frames, plus the shared `hud-button`, `hud-option`, `hud-input`, `hud-title` and `hud-kicker` styles. Decorative layers are clipped; content and focus rings are not. The approved cyan logo shares this palette; its proportions and metallic artwork stay intact.

Open `/design` for the live defaults and interactive component previews. Barlow is bundled locally with its OFL license. The [visual reference guide](../docs/DESIGN-SYSTEM.md) records how the seven reference images informed the system.

Every shared UI component has its own folder under `src/components/ui/`, with a public `index.ts` and its implementation. Keep component-specific styles and meaningful types/hooks there as they grow. Application imports use `@/components/ui/button`, `@/components/ui/dialog`, and the other public entries. The Dialog primitive owns the default cyan HUD frame and enabled buttons use a pointer cursor globally.

The design module owns adapters, state controllers, pure UI, feature composition and message catalogs. Its host bridge supplies localization and application components; core module code does not import Next.js or the concrete global language picker. The route mounts the public host entry.

## Run locally

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm run build` builds the production app; `npm start` serves that build. `npm run lint` runs ESLint.

## URL-driven language

The supported values are `?lang=en` and `?lang=pt-BR`, on every application route. English is the default. Missing, invalid or repeated `lang` values resolve to English. Cookies, local storage and browser language do not select the application language. There are no locale path prefixes.

The language dialog opens from the header. Selecting an option updates the current history entry without refreshing or navigating the server. The dialog stays open, and the current page's input state stays mounted. The pathname, other query parameters and hash remain intact. Escape or the close button dismisses the dialog and returns focus to its trigger.

`src/proxy.ts` resolves the incoming query and overwrites an internal request header. The async root layout reads it to render the initial document language and metadata. This is an explicit dynamic-rendering boundary. The client provider then observes the URL query, including navigation and history changes; the server header is not ongoing client locale state.

## Translate a module

Interactive translated content belongs in a Client Component. Keep the route's Server Component focused on composition:

```tsx
"use client";

import { useTranslations } from "@/i18n";

export function ExampleHeading() {
  const copy = useTranslations("example");
  return <h1>{copy.title}</h1>;
}
```

Messages are organized by module namespace in `src/i18n/messages/en.ts` and `src/i18n/messages/pt-BR.ts`. Add a namespace or key to English, then provide the same shape in Portuguese. `Messages` and `satisfies` enforce parity during type checking. Keep UI text, labels, accessible names and recoverable errors in these dictionaries rather than inline locale conditionals.

Server-rendered translated content must resolve the request locale through the same allowlist. A server-only string will not react to a same-document language switch; use the client translation boundary for text that must update immediately. Do not key the application provider or page by locale, which would remount state.

## Use locale and formatting

```tsx
"use client";

import { useI18n, useTranslations } from "@/i18n";

export function PlanetCount({ count }: { count: number }) {
  const { locale, format, setLocale } = useI18n();
  const copy = useTranslations("example");

  return (
    <button type="button" onClick={() => setLocale(locale === "en" ? "pt-BR" : "en")}>
      {format.plural(count, copy.planets)}
    </button>
  );
}
```

`format.number`, `format.dateTime` and `format.plural` use `Intl` with the active locale. Dates default to UTC so server and client formatting agree; pass an explicit time zone when a feature requires another one. The initial plural helper supports `one` and `other`, matching the current message contract.

## Preserve language across pages

```tsx
"use client";

import { LocalizedLink, useTranslations } from "@/i18n";

export function ExampleLink() {
  const common = useTranslations("common");
  return <LocalizedLink href="/example?view=list#details">{common.example}</LocalizedLink>;
}
```

Use `LocalizedLink` for root-relative application links. It adds the current language while retaining the destination's other query parameters and hash. It does not add language to external links. Future authentication return URLs must preserve language through a separately validated application return path.

Application translation covers the interface, not imported website content. A language change must not translate crawled text, change source URLs, start imports or create catalog records.

## Link to a section

Use the shared native `AnchorLink` for a section on the current page. Its required `href` accepts a fragment, not an application route. It keeps the pathname and query, including `lang`, and lets the browser update the hash and history.

```tsx
import { AnchorLink } from "@/components/ui/anchor-link";

<AnchorLink href="#typography">{copy.sections.typography}</AnchorLink>
<section id="typography" className="hud-anchor-target">...</section>
```

The global document style scrolls anchors smoothly. `prefers-reduced-motion: reduce` switches scrolling to `auto`; no JavaScript timers or history interception are involved. `hud-anchor-target` leaves a small gap above the destination. Use `LocalizedLink` for navigation to another application page.

## Verify a change

Check direct entry in both locales, invalid-query fallback, same-page input preservation, navigation between `/` and `/example`, Back/Forward, keyboard dialog behavior and a production build. SSR metadata and initial document language should match the query before hydration. The example is a UI demonstration, not a working account or ingestion feature.
