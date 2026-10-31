# HackUniverse web

Next.js App Router, React, TypeScript and Tailwind CSS, with shared Velrino UI primitives. `/` is an immersive, full-viewport 3D explorer with separate Demo and browser-local workspaces; `/example` retains the translated input example. All routes share browser detection and a global query override. Account-backed catalog persistence, authentication and the account dashboard remain planned work.

The approved transparent logo is stored at `../assets/images/logo.png`, served from `public/brand/logo.png`, and displayed in the shared header. App Router serves the generated `src/app/favicon.ico` and `src/app/icon.png` automatically.

## Visual system

The interface uses a cyan science-fiction HUD theme. `src/styles/hud.css` owns the application `--hud-*` tokens and maps them to `--vui-*`; `src/app/layout.tsx` imports the compiled package stylesheet explicitly before application styles, so it remains a tracked dependency of the production bundle. Barlow and the approved cyan logo remain application assets.

The reusable implementations live in [Velrino UI](https://github.com/velrino/velrino-ui), pinned to its compiled `v0.0.5` GitHub release asset. `src/components/ui/<component>/index.ts` preserves application import paths through thin package exports. Use `Panel` for content grouping, `Dialog` for modals, `Select` for themed selection menus, `StepNavigation` for controlled stage navigation and `Switch` for binary settings. Standard surfaces are the package default; the application opts into chamfered frames once through `UIProvider appearance="sci-fi"`. Decorative layers are clipped; content and focus rings are not.

[Open the shared component gallery](https://velrino.github.io/velrino-ui/?theme=cyan&appearance=sci-fi) for all 17 interactive sections. Application header and universe menu links open it in a new tab with the active language and cyan sci-fi presentation, leaving the current universe open. `/design` redirects existing bookmarks to that site, including valid language selection and section fragments.

`src/modules/design-system` now owns only the link and URL adapter. Gallery copy, examples and showcase CSS are no longer bundled in this application. Product modules import application primitives, keeping routing, first-visit intro, providers, scene state and analytics local. See the [visual reference guide](../docs/DESIGN-SYSTEM.md) and [package adoption guide](https://github.com/velrino/velrino-ui/blob/main/docs/adoption.md).

## Universe home

The home is a minimal, mobile-first 3D map with 767 real planets and 1,270 entities across 450 systems, 32 regions and 20 real galaxies. Eight Solar System planets and 759 confirmed exoplanets use sourced names and descriptions; the initial region groups nearby systems, while other populated regions group sky constellations rather than claiming physical-cloud membership. Earth and Solar identity remain stable. Geometry, colors, distances and motion are illustrative. The existing renderer detail/texture/context budgets and 24-result atlas pagination remain in force. See [the data guide](../docs/UNIVERSE-DATA.md#factual-bundled-demo) for source snapshots, organized authoring and limits.

The initial Solar Neighborhood contains 16 systems and 34 planets: the Solar System plus 15 additional real nearby hosts, including GJ 887, GJ 1061 and AU Mic. The Demo-only **Nearby systems** action in the hamburger menu’s Pause tab opens this region directly. This curated selection uses source-reported distances within 15 parsecs; it does not move or duplicate existing systems and does not change Local data.

Edit the [organized demo authoring JSON](src/modules/universe/data/demo-universe.json) to change its content and groupings. Counts come from that data. `DemoUniverseHost` supplies the bundled catalog to the public `UniverseWorkspaceHost`; reusable `UniverseHost` accepts an already validated catalog. Import canonical types and `parseUniverseCatalog` from `@/modules/universe/domain`, and keep supplier normalization in separate adapters. URLless objects and empty universes are supported. [The data guide](../docs/UNIVERSE-DATA.md) owns the full contract and adapter examples; [the explorer guide](../docs/UNIVERSE-EXPLORER.md) documents camera ownership, optional system-bound flight, performance budgets and validation limits. The Space Jump presentation is temporarily disabled. The [starter spacecraft credits](../docs/ASSET-CREDITS.md) identify its creator and CC BY 4.0 license.

Local editing, multiple universes, cascading deletion and browser persistence are documented in [the local workspace guide](../docs/LOCAL-WORKSPACE.md). Its guided editor reveals optional fields on request, suggests a location from the current selection and validates only the final Create/Save action. Manual JSON transfer follows File → Options → Confirm, with an optional advanced editor. Source selection and storage remain outside the renderer through host-owned management ports; `FloatButtonGroup` supplies the shared floating actions. The global identity provider opens a login preview without creating a session or saving credentials. Localhost ports and the production origin have separate workspaces, with no automatic upload or synchronization.

The [audio guide](../docs/UNIVERSE-AUDIO.md) records audio provenance, playback controls and browser behavior. Application-owned persistence shares the lazy [browser storage transport](../docs/BROWSER-STORAGE.md); modules retain their own schemas, defaults and recovery rules.

`DemoUniverseHost` also supplies the guided Earth-to-universe tour as presentation configuration. It waits for scene readiness and the global intro, and runs automatically once with a three-second Earth arrival hold. Manual replay from Settings approaches Earth from the current camera through adjacent hierarchy groups, holds for one second after arrival, then follows the original outward steps. The hook snapshots a prepared manual route while awaiting readiness. Its `hackuniverse.demo-tour.v1.seen` flag is independent of the welcome flag below; [the explorer guide](../docs/UNIVERSE-EXPLORER.md#guided-demo-tour) owns cancellation, timing and reduced-motion rules.

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

The first-visit sequence is owned by `ApplicationIntro`; see [startup preparation](../docs/UNIVERSE-EXPLORER.md#startup-preparation) for loader timing, background scene preparation, the subsequent audio entry action and returning visits. The manual loading preview lives on the shared documentation site and remains independent of application startup.

## Run locally

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). `npm run build` builds the production app; `npm start` serves that build. `npm run lint` runs ESLint. `npm run test:catalog` runs the canonical catalog and supplier-adapter contract tests; `npm run test:scene` checks tour continuity and shared orbital motion. `npm run test:workspace` checks local CRUD, persistence and write-lock contracts. See [the data guide](../docs/UNIVERSE-DATA.md#validation) and [workspace guide](../docs/LOCAL-WORKSPACE.md#validation-and-roadmap).

## Browser verification

After `npm run build`, run `npx playwright install chromium` and `npm run test:browser`. Desktop/mobile checks open the actual explorer dialog, switch tabs and verify safe new-tab documentation navigation while retaining the canvas. External documentation responses are substituted locally in CI; the published gallery has its own browser suite. CI installs Chromium and runs these checks against the production build with software WebGL. These checks do not measure physical-device performance.

## Production deployment

Global PostHog analytics and exception tracking are optional and environment-configured. See [web observability](../docs/OBSERVABILITY.md) for setup, application event prefixes, error coverage and payload policy. No ingestion or personal API credential is committed; copy [`.env.example`](.env.example) to ignored `.env.local` for local configuration.

The web app is deployed to [universe.velrino.co](https://universe.velrino.co/) in the Vercel project `hackuniverse`, under the `velrino` scope. The previous `hackuniverse.vercel.app` address redirects to the custom domain while preserving paths and query parameters. The first production deployment uses source commit `5761874`, with the Next.js preset, the default `npm run build` command and Node.js 24.x. The current UI requires no application environment variables.

Run the production deployment from this `web/` directory:

```sh
npx vercel@65.4.0 deploy --prod --yes --project hackuniverse --scope velrino
```

This uploads the current local web source. If Git-based deployment is configured later for the monorepo, use `web` as its Root Directory. Keep credentials and local `.vercel` state out of Git.

## Global language

English (`en`), Brazilian Portuguese (`pt-BR`) and Filipino (`fil`) use one shared language API on every route. Browser detection, query precedence, server/client consistency and one-language-per-row selectors follow the canonical [localization contract](../docs/LOCALIZATION.md). Use `?lang=fil` to open any page in Filipino. Manual changes update the URL in place and preserve the current page and input.

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

Messages are organized by module namespace in `src/i18n/messages/en.ts`, `src/i18n/messages/pt-BR.ts` and `src/i18n/messages/fil.ts`. Add a namespace or key to English, then provide the same shape in Portuguese and Filipino. `Messages` and `satisfies` enforce parity during type checking. Keep UI text, labels, accessible names and recoverable errors in these dictionaries rather than inline locale conditionals.

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
