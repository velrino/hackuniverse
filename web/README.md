# HackUniverse web

Next.js App Router, React, TypeScript and Tailwind CSS, with shared Velrino UI primitives. `/` is an immersive, full-viewport 3D universe demo with floating controls; `/example` retains the translated input example. All routes share the URL-driven language contract. Account-backed catalog persistence, the production universe and the account dashboard remain planned work.

The approved transparent logo is stored at `../assets/images/logo.png`, served from `public/brand/logo.png`, and displayed in the shared header. App Router serves the generated `src/app/favicon.ico` and `src/app/icon.png` automatically.

## Visual system

The interface uses a cyan science-fiction HUD theme. `src/styles/hud.css` owns the application `--hud-*` tokens and maps them to `--vui-*`; `src/app/layout.tsx` imports the compiled package stylesheet explicitly before application styles, so it remains a tracked dependency of the production bundle. Barlow and the approved cyan logo remain application assets.

The reusable implementations live in [Velrino UI](https://github.com/velrino/velrino-ui), pinned to its compiled `v0.0.3` GitHub release asset. `src/components/ui/<component>/index.ts` preserves application import paths through thin package exports. Use `Panel` for content grouping and `Dialog` for modal behavior. Standard surfaces are the package default; the application opts into chamfered frames once through `UIProvider appearance="sci-fi"`. Decorative layers are clipped; content and focus rings are not.

[Open the shared component gallery](https://velrino.github.io/velrino-ui/?theme=cyan&appearance=sci-fi) for all 15 interactive sections. Application header and universe menu links open it in a new tab with the active language and cyan sci-fi presentation, leaving the current universe open. `/design` redirects existing bookmarks to that site, including valid language selection and section fragments.

`src/modules/design-system` now owns only the link and URL adapter. Gallery copy, examples and showcase CSS are no longer bundled in this application. Product modules import application primitives, keeping routing, first-visit intro, providers, scene state and analytics local. See the [visual reference guide](../docs/DESIGN-SYSTEM.md) and [package adoption guide](https://github.com/velrino/velrino-ui/blob/main/docs/adoption.md).

## Universe home

The home is a minimal, mobile-first 3D map with 738 planets and 871 entities across 107 systems, 20 stellar clouds and five galaxies. The Milky Way includes seven fictional demo sectors alongside the unchanged Solar Neighborhood; its membership and spacing are illustrative, not astronomical measurements or a confirmed planet inventory. Existing records and visual seeds remain stable, and Earth is the initial target. Galaxies use a luminous multicolor baseline and a brighter hover state that preserves their hues. Planet selection preserves the system; central-star clicks or keyboard labels frame the intact system and open star details. One hamburger contains the searchable atlas, view options, flight controls and language settings. The atlas displays 24 results per page.

Edit the [canonical demo JSON](src/modules/universe/data/demo-universe.json) to change its content and groupings. Counts come from that data. `DemoUniverseHost` selects the bundled catalog; reusable `UniverseHost` accepts an already validated catalog. Import canonical types and `parseUniverseCatalog` from `@/modules/universe/domain`, and keep supplier normalization in separate adapters. URLless objects and empty universes are supported. [The data guide](../docs/UNIVERSE-DATA.md) owns the full contract and adapter examples; [the explorer guide](../docs/UNIVERSE-EXPLORER.md) documents camera ownership, optional system-bound flight, performance budgets and validation limits. The Space Jump presentation is temporarily disabled. The [starter spacecraft credits](../docs/ASSET-CREDITS.md) identify its creator and CC BY 4.0 license.

`DemoUniverseHost` also supplies the guided Earth-to-universe tour as presentation configuration. It waits for scene readiness and the global intro, and runs automatically once with a three-second Earth arrival hold. Manual replay from View approaches Earth from the current camera through adjacent hierarchy groups, holds for one second after arrival, then follows the original outward steps. The hook snapshots a prepared manual route while awaiting readiness. Its `hackuniverse.demo-tour.v1.seen` flag is independent of the welcome flag below; [the explorer guide](../docs/UNIVERSE-EXPLORER.md#guided-demo-tour) owns cancellation, timing and reduced-motion rules.

All bundled entities explicitly carry optional `type: "demo"`; catalog `mode` never assigns that classification. A hide-demo feature is not implemented. The [data guide](../docs/UNIVERSE-DATA.md) owns classification, star metadata, rendering-only scene anchor/ancestors and future filtering rules. Detailed system previews require a projected extent of at least 28 pixels and are limited to four at scene widths below 640 pixels, eight otherwise; other systems remain light proxies. Bounded spiral particles and neighboring-group points preserve the surroundings through hierarchy zooms. They remain decorative and refresh when crossing the mobile breakpoint; [the explorer guide](../docs/UNIVERSE-EXPLORER.md#scene-detail-and-scale) defines continuity and rendering budgets.

## Typewriter text

Use the shared span inside the caller's heading or paragraph:

```tsx
import { TypewriterText } from "@/components/ui/typewriter-text";

export function ObjectCopy({ id, name, description }: { id: string; name: string; description: string }) {
  return <>
    <h2><TypewriterText text={name} replayKey={id} /></h2>
    <p><TypewriterText text={description} replayKey={id} /></p>
  </>;
}
```

`text` is required; optional props are `className`, `delayMs` (25), `maxDurationMs` (3500), `replayKey` and `enabled` (true). A text or replay-key change restarts the writing; `enabled={false}` shows the full text. Elapsed-time updates are batched about every 32 ms, with timer cleanup on replacement/unmount. Unicode graphemes, reduced motion and a full-text layout reserve keep the effect readable and stable. Screen readers receive the full text once; visual typing is hidden from them. There is no loop, deletion, shuffle, cursor or speech output.

The current application uses this effect only for planet/star panel names and descriptions. Facts, demo markers, source links and actions remain immediate. Keep these same limits when reusing the component; [the visual guide](../docs/DESIGN-SYSTEM.md#detail-text-reveal) records the interaction standard.

## First-visit welcome

The shared `ApplicationIntro` displays the full-screen planetary loader for three seconds on the first visit to any route. It persists `hackuniverse.intro.v1.seen` in browser local storage before opening, so refreshes, later visits and page navigation do not replay it. This is an introductory animation with indeterminate progress, not a measure of network or provider work. Locale preference remains exclusively URL-driven.

The intro is mounted once inside the application provider. It keeps its deadline across effect replay, cleans up timers on unmount and falls back to a document guard when storage is unavailable. The manual loading preview lives on the shared documentation site and remains independent of this application intro.

## Run locally

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm run build` builds the production app; `npm start` serves that build. `npm run lint` runs ESLint. `npm run test:catalog` runs the canonical catalog and supplier-adapter contract tests; `npm run test:scene` checks tour continuity and shared orbital motion. See [the data guide](../docs/UNIVERSE-DATA.md#validation).

## Browser verification

After `npm run build`, run `npx playwright install chromium` and `npm run test:browser`. Desktop/mobile checks open the actual explorer dialog, switch tabs and verify safe new-tab documentation navigation while retaining the canvas. External documentation responses are substituted locally in CI; the published gallery has its own browser suite. CI installs Chromium and runs these checks against the production build with software WebGL. These checks do not measure physical-device performance.

## Production deployment

Global PostHog analytics and exception tracking are optional and environment-configured. See [web observability](../docs/OBSERVABILITY.md) for setup, application event prefixes, error coverage and payload policy. No ingestion or personal API credential is committed; copy [`.env.example`](.env.example) to ignored `.env.local` for local configuration.

The web app is deployed to [hackuniverse.vercel.app](https://hackuniverse.vercel.app) in the Vercel project `hackuniverse`, under the `velrino` scope. The first production deployment uses source commit `5761874`, with the Next.js preset, the default `npm run build` command and Node.js 24.x. The current UI requires no application environment variables.

Run the production deployment from this `web/` directory:

```sh
npx vercel@65.4.0 deploy --prod --yes --project hackuniverse --scope velrino
```

This uploads the current local web source. If Git-based deployment is configured later for the monorepo, use `web` as its Root Directory. Keep credentials and local `.vercel` state out of Git.

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
