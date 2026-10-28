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

The home now provides a mobile-first, full-screen 3D demo backed by [400 synthetic website records](web/src/modules/universe/data/demo-universe.json), across 40 systems, 12 stellar clouds and four galaxies. Systems contain 5–20 planets with varied surfaces and stable colors drawn from a 100-color palette. Selecting a planet zooms within its existing system; a compact hamburger opens the atlas and options. Optional third-person flight stays inside the active system. The Space Jump cutscene is temporarily disabled; changing systems has no presentation delay.

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
