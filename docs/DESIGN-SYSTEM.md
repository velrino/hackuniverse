# HackUniverse visual reference guide

These seven local images define visual principles, not production assets. Their redistribution rights are unverified. Keep the originals outside the application; build the useful geometry, hierarchy and interaction states with CSS and existing components. Do not publish screenshots, stock watermarks, game characters or borrowed artwork.

## Default visual language

Use a dark blue-black background, cyan interaction accents, thin technical outlines, restrained glow and cut-corner panels. Pale text carries primary information; muted blue-gray supports secondary information. The approved HackUniverse logo uses the cyan metallic palette. Preserve its silhouette, proportions and transparent margins. The earlier gold version is retained as an archived asset, not the interface default.

Application tokens live in `web/src/styles/hud.css`; reusable Panel, Button, Dialog and other primitives come from [Velrino UI](https://github.com/velrino/velrino-ui). Current base tokens include `#020a10` background, `#06131e` surface, `#42e8f4` accent and `#e5fbff` text. Consume semantic tokens rather than copying colors into each screen. The central [Velrino UI gallery](https://velrino.github.io/velrino-ui/?theme=cyan&appearance=sci-fi) demonstrates the cyan palette and live hover, focus, selected, disabled, loading and validation states.

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

## 3D destination feedback

Every galaxy, cloud, system, central star and planet uses its own stable native-highlight callback. Hover brightens existing cores, particles, mini planets, globes and rings; it adds no circular overlay, hover-only aura, Sprite or geometry. Orbit lines and the outer background are excluded. Textured planets receive a restrained emissive cue that preserves their surface map and base hue, including the 100-color palette. Leaving or cancelling hover restores the exact material baselines. Dragging, menus, flight, tours and camera/view transitions suppress transient hover feedback.

Galaxies have two brightness states: a visibly luminous baseline with seeded multicolor spiral particles and a stronger hover state. A shared neutral white-alpha mask preserves particle hues, and hover applies a neutral brightness gain. Switching between these states reuses the current core and particle geometry without additional draw calls; keep the 640-particle bound and five-CSS-pixel circular particle cap. Surrounding spiral particles and bounded sibling points preserve visual continuity across zoom levels. The retained core appears only in galaxy detail, and cloud haze belongs to distant galaxy-view markers. Shared factories, transforms and the three-draw context budget are defined in [the explorer guide](UNIVERSE-EXPLORER.md#scene-detail-and-scale). Their colors illustrate the map and do not encode astronomical measurements. Separate foreground nebula wisps remain removed.

Selected planets and central stars share a minimal cyan selection ring at 50% opacity, with normalized inner/outer radii of `1` and `1.008`. Its inner edge sits 2.5% outside the projected sphere silhouette, following perspective as the camera moves; hide it when the camera reaches the surface or enters the sphere.

Manual tour replay approaches its configured start from the visible camera pose through adjacent hierarchy views. Preserve this continuity and begin its one-second hold only after arrival; the automatic first-visit Earth hold remains three seconds. [The tour contract](UNIVERSE-EXPLORER.md#guided-demo-tour) owns the sequence and cancellation rules.

Destination names anchor to the projected object center, with text normally 28 screen pixels above it. Keep 44-pixel label targets, visible keyboard focus, collision handling and reserved HUD space. Cluster pick proxies use a radius of 24% of the marker extent, keeping the outer decorative particles out of the interaction target; physical planet meshes retain their normal picking shape. Labels and the searchable Atlas provide accessible alternatives when a cluster center is small, especially on touch screens. See [the explorer guide](UNIVERSE-EXPLORER.md) for camera and tour behavior.

Central-star labels are keyboard-operable destinations. Their detail panel keeps the whole system visible, shows only supplied physical facts and exposes a validated reference when available. Illustrative systems use an immediate Demo marker; a real object name does not imply a confirmed orbital-body inventory or physical layout. Canonical classification rules remain in [the data guide](UNIVERSE-DATA.md).

## Detail text reveal

Use shared `TypewriterText` only for the current planet/star panel name and description. It is a span within the caller's heading or paragraph; facts, classifications, links and actions appear immediately. Defaults are 25 ms per grapheme with a 3,500 ms cap, no loop/deletion/cursor/speech, and replay when text or the explicit replay key changes. The final text reserves layout from the start, screen readers receive one full copy, and reduced motion bypasses the visual writing. Long unbroken text must wrap without widening the panel. See [the public component usage](../web/README.md#typewriter-text).

## Implementation and local assets

The canonical gallery is hosted by Velrino UI on GitHub Pages. Application navigation opens it in a new tab, forwarding the active language and cyan sci-fi preferences. `/design` redirects legacy links; the application no longer mounts gallery examples, translated catalogs or their optional stylesheet. Its navigation adapter lives in `web/src/modules/design-system`.

The package owns accessible components and decorative styling. Thin application exports retain individual component folders and public `index.ts` entries. `Panel` groups content; `Dialog` provides modal behavior. `UIProvider` selects sci-fi appearance and the application's cyan HUD tokens map to package variables. Other consumers can choose standard surfaces and their own palettes. Loading previews are labeled simulations on the shared site; real application use supplies operation progress.

Barlow 400, 600, 700 and 800 are bundled locally under `web/src/styles/fonts/` through `next/font/local`, with their [SIL Open Font License](../web/src/styles/fonts/OFL.txt). Files come from [Google Fonts](https://fonts.google.com/specimen/Barlow); build and runtime do not fetch fonts externally.

The supplied `0xCezzVerse-2115246850156699774-01.mp4` adds a motion reference: thin wireframe geometry, orbital elements and a horizontal scan. The loading screen adapts these principles into an original cyan planet with controlled central progress. The reference video itself is not shipped in the application.
