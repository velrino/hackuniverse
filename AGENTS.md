# HackUniverse contributor guide

Read the nearest package guide before changing code. The current application lives in `web/`; `api/` (Go) and `evals/` (Python) are planned packages. Keep one monorepo, one web application and one Go module when the API is introduced.

## Read first

- [Project overview](README.md)
- [Web setup, i18n and component conventions](web/README.md)
- [Next.js package instructions](web/AGENTS.md)
- [Visual system and reference decisions](docs/DESIGN-SYSTEM.md)
- [Review skill](.agents/skills/review/SKILL.md)

## Architecture and scaling

- Keep routes and layouts focused on composition. Consumers import module public entry points or an intentional public host entry, never private feature files.
- Organize modules around capabilities. Module-owned `adapters` define the contracts; the host supplies concrete integrations with stable wiring. Keep controllers in `hooks`, pure presentation in `ui`, and feature composition in `features` when these boundaries have real work.
- Keep `ui/base`, `ui/shared` and `ui/layout` focused on their actual consumers. Do not create empty layers, generic repositories, service locators or a callback for every business operation.
- Give each shared UI component its own folder and public `index.ts`. Keep implementation, styles and useful types/hooks together. Application code uses the public entry rather than importing component internals.
- The design module owns its message catalogs. Its host supplies global localization, branding and application components; core code does not import those concrete integrations.
- Promote shared code when its consumers share meaning and lifecycle. Preserve distinct models and responsibilities instead of forcing similar code into one abstraction.

## Web defaults

- Preserve React, Next.js App Router, TypeScript, Tailwind and the shadcn/ui foundation. Read the installed Next.js documentation before using version-sensitive APIs.
- English (`en`) is the default; Brazilian Portuguese (`pt-BR`) is secondary. The global `lang` query parameter is authoritative. Missing, invalid or repeated values resolve to English. No locale path prefixes or stored/browser preference overrides.
- Language changes update in place without document refresh, server navigation, application remount or loss of user input. Preserve the pathname, other query parameters and hash. Use the public i18n API and locale-preserving links.
- `/design` is the live design reference. Reuse its underlying components and the cyan HUD tokens; do not import showcase internals into product modules or create independent palettes.
- Standard dialogs inherit the cyan chamfered frame, accessible focus behavior and bounded scrolling. Enabled buttons have a pointer cursor; disabled controls are excluded.
- The approved logo and favicons are cyan. Preserve the canonical source under `assets/images/` and keep public derivatives consistent.
- Loading progress is controlled by the real operation. Timed progress on `/design` is an explicitly labeled preview. Preserve cancellation semantics, timer cleanup and reduced-motion behavior.
- New accounts start with zero planets. One website is one planet; pages and refreshes do not create extra planets. Application localization does not translate imported website content.

## Working and validation

- Keep requested work scoped. Preserve unrelated edits and running user processes. Do not copy private reference-project names, paths or implementation details into public artifacts.
- Keep credentials and private content out of source, logs, fixtures, screenshots and issue evidence. Use synthetic data for checks.
- Run checks relevant to the change and state what was actually verified. A build is not a browser journey; local validation is not deployment. Add focused verification for concrete risks rather than mirroring implementation or chasing coverage.
- Keep canonical human guidance under `docs/` and write repository documentation in English. Package guides should link to it rather than duplicate rules.
- Track requested work in GitHub issues. Create commits, push or publish when authorized; do not infer those actions from a review request.

## Reviews

Use the `review` skill for requested code, diff, PR or repository reviews. Follow its evidence-based severity and output format. Review only unless the user explicitly asks for fixes. Keep optional improvements separate from defects and state checks and limitations.

## Conditional iPhone installation preference

Standing user instruction (2026-09-24): whenever an iOS development build is ready and installation is possible, install it on the user's connected iPhone as part of completing the task, without asking again. A request to build iOS includes device installation when available. Update the existing app in place, preserving its data. If the device is unavailable or locked, report the concrete blocker. Do not claim installation succeeded without checking the tool result.
