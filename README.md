# HackUniverse

Turn websites into planets and organize them into galaxies and universes.

The initial proof of concept will use Firecrawl to import website content. New accounts will start with zero planets.

Production web: [hackuniverse.vercel.app](https://hackuniverse.vercel.app). The live component reference is available at [/design](https://hackuniverse.vercel.app/design?lang=en).

## Project structure

- `web/` — Next.js, React, TypeScript, and Tailwind CSS, with modular i18n and a shadcn/ui language dialog.
- `api/` — Planned Go API.
- `evals/` — Planned Python evaluations.

## Run the web app

```bash
cd web
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000).

English is the default language. Use `?lang=pt-BR` or the language dialog to switch to Brazilian Portuguese without reloading. See [the web guide](web/README.md) for the shared translation API and example pages.

Visit `/design` for the shared cyan HUD components, typography, colors and loading preview. The [visual reference guide](docs/DESIGN-SYSTEM.md) records the design direction.

For the architecture and implementation plan, see [umbrella issue #1](https://github.com/velrino/hackuniverse/issues/1).
