# HackUniverse

Turn websites into planets and organize them into galaxies and universes.

The explorer uses a provider-neutral catalog contract. A separate Firecrawl search adapter demonstrates supplier normalization; live imports and persistence remain planned work. New accounts will start with zero planets.

Production web: [hackuniverse.vercel.app](https://hackuniverse.vercel.app/).

## Project structure

- `web/` — Next.js, React, TypeScript, and Tailwind CSS, with modular i18n and a shadcn/ui language dialog.
- `api/` — Planned Go API.
- `evals/` — Planned Python evaluations.

## Design system

Explore the live reference at [/design?lang=en](https://hackuniverse.vercel.app/design?lang=en). It documents the shared cyan sci-fi HUD defaults: colors, typography, buttons, inputs, dialogs, branding and the full-screen planetary loading component, with interactive examples.

Use these shared components and tokens when building new pages. The [visual reference guide](docs/DESIGN-SYSTEM.md) explains the design direction, and [the web guide](web/README.md) covers component usage and module structure. The `lang=en` query parameter opens the interface in English; the global language dialog can switch to Brazilian Portuguese without reloading.

## Universe demo

The home provides a mobile-first, full-screen 3D demo with [408 planets](web/src/modules/universe/data/demo-universe.json): 400 fictional websites plus the eight familiar Solar System planets, across 41 systems, 13 stellar clouds and five galaxies. The original systems contain 5–20 planets; the Solar System adds eight. Fictional planets retain their stable 100-color palette; the Solar System adds one curated gray Mercury preset.

Start on Earth, watch the first-visit tour widen to the universe, or replay it from View. Selecting a planet preserves its whole system; one hamburger opens the atlas and options. Optional third-person flight stays inside the active system. The Space Jump cutscene remains temporarily disabled. Tour timing, cancellation and accessibility are documented in the explorer guide.

The default JSON is already canonical. The reusable host also accepts validated catalogs with optional references, URLless objects and an empty root. See the [explorer guide](docs/UNIVERSE-EXPLORER.md), [catalog contract and adapter examples](docs/UNIVERSE-DATA.md) and [spacecraft credits](docs/ASSET-CREDITS.md). This synthetic demo does not create real account content or make provider requests.

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

English is the default language. Use `?lang=pt-BR` or the language dialog to switch to Brazilian Portuguese without reloading. See [the web guide](web/README.md) for the shared translation API and example pages.

For the architecture and implementation plan, see [umbrella issue #1](https://github.com/velrino/hackuniverse/issues/1).
