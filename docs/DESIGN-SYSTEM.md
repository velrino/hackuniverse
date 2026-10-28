# HackUniverse visual reference guide

These seven local images define visual principles, not production assets. Their redistribution rights are unverified. Keep the originals outside the application; build the useful geometry, hierarchy and interaction states with CSS and existing components. Do not publish screenshots, stock watermarks, game characters or borrowed artwork.

## Default visual language

Use a dark blue-black background, cyan interaction accents, thin technical outlines, restrained glow and cut-corner panels. Pale text carries primary information; muted blue-gray supports secondary information. The approved HackUniverse logo uses the cyan metallic palette. Preserve its silhouette, proportions and transparent margins. The earlier gold version is retained as an archived asset, not the interface default.

The implementation authority is `web/src/styles/hud.css`, with shared `HudPanel`, Button and Dialog primitives. Current base tokens include `#020a10` background, `#06131e` surface, `#42e8f4` accent and `#e5fbff` text. Consume semantic tokens rather than copying colors into each screen. `/design` must demonstrate those actual defaults, including hover, focus, selected, disabled, loading and validation states.

## Reference decisions

- **`1000_F_1537568194_kiZjJNLIK2UjxL7sLN0gwVHNNA3NocYM.jpg`** — Cyan translucent panels, asymmetric chamfers, grid backgrounds, edge bars and small technical markers. Adopt a consistent panel silhouette and sparse edge details. Do not reproduce its Adobe Stock artwork, watermark, arbitrary numbers or decorative clutter.
- **`19fa5f154379633.649b1138e1e97.webp`** — A game lobby separates central content from peripheral lists, status cards and primary actions. Adopt that hierarchy for the universe viewport and management overlays. Do not inherit combat imagery, game missions, fabricated activity, unreadable muted text or crowded sidebars on mobile.
- **`1d510f247482701.69dc74ab04223.webp`** — A teal 3D focal point sits beneath clear navigation and a glass data panel. Adopt generous scene space, strong content hierarchy and grounded details. Do not copy its botanical scene, fictional specifications, coordinates or oversized opaque overlays.
- **`466f9e63632747.5ab752f7072a2.webp`** — Monochrome instrumentation uses hairline frames, grids and modular blocks. Adopt disciplined alignment and technical separators. Do not inherit tiny labels, arbitrary diagnostic graphs, constant scanning or low-contrast decoration.
- **`6b67c6152715737.6322d2c18e4cd.webp`** — A customization layout combines geometric selections, a clear selected outline and contextual explanation. Adopt explicit selection, concise help and visual grouping. Do not force radial menus, controller prompts, locked upgrades or the astronaut artwork into website management.
- **`6c33ed152715737.6322d2c18d402.webp`** — A component sheet distinguishes normal, selected and disabled states with cyan outlines and clipped corners. It explicitly names Barlow and shows cyan `#4FD5FF`, peach `#EFB09D`, red and yellow. Adopt the state vocabulary and Barlow hierarchy; treat colors as inspiration, not a requirement to replace semantic project tokens. Do not reuse its custom icon drawings without permission.
- **`af5b67247482701.69dc74ab0464e.webp`** — A case-study sheet explains scene-led composition, teal accents and structured information panels. Adopt its documented design rationale and readable section hierarchy. Do not import its author identity, marketing copy, imagery or claims as HackUniverse content.

## Clarity and accessibility

Use Barlow for readable interface typography, reserving uppercase/tracking for short labels. Keep body copy comfortable, localizable and responsive. Preserve semantic buttons/dialogs, visible keyboard focus, meaningful labels, contrast and sufficiently large targets. Clip decorative layers rather than content or focus rings. Reduced-motion mode removes unnecessary movement; selection and status must remain understandable without animation, glow or color alone. Use the existing i18n system for English and Portuguese content.

## Implementation and local assets

`/design` is the live component reference. Its previews use the same primitives and tokens as the application. Add future defaults to those shared components before documenting them here. The loading preview is a labeled simulation; real use supplies operation progress to the reusable full-screen loader.

Shared components live in individual folders with a public `index.ts`; component-specific styles stay in that folder. Modules own consumer contracts in `adapters`, behavior in `hooks`, pure presentation in `ui`, and application integration in an explicit host entry. The route composes that host. All standard dialogs inherit the cyan chamfered frame from the shared Dialog primitive, and enabled buttons inherit a pointer cursor.

Barlow 400, 600, 700 and 800 are bundled locally under `web/src/styles/fonts/` through `next/font/local`, with their [SIL Open Font License](../web/src/styles/fonts/OFL.txt). Files come from [Google Fonts](https://fonts.google.com/specimen/Barlow); build and runtime do not fetch fonts externally.

The supplied `0xCezzVerse-2115246850156699774-01.mp4` adds a motion reference: thin wireframe geometry, orbital elements and a horizontal scan. The loading screen adapts these principles into an original cyan planet with controlled central progress. The reference video itself is not shipped in the application.
