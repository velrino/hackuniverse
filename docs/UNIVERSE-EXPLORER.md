# Immersive universe demo

The home route is a full-viewport 3D demo with **408 planets**: 400 fictional website records and one deliberately ordinary, eight-planet Solar System. Its 41 systems, 13 stellar clouds and five galaxies come from [the editable canonical catalog](../web/src/modules/universe/data/demo-universe.json). The original 40 systems contain 5–20 planets each; the added Solar System contains eight, and the initial target is Earth. [The data contract](UNIVERSE-DATA.md) separates application-owned objects from optional supplier adapters. This creates no accounts, persisted planets, jobs, or provider requests.

## Interaction contract

- The original 400 demo planets represent fictional websites; the eight Solar System objects use familiar names and URLless references. The canonical contract also supports other URLless objects, such as documents or tickets. Systems and stellar clouds are visual groupings under galaxies and a universe. The rendered star is a system anchor, not another catalog record. These view groupings do not silently change the planned persistent account/catalog model.
- Selecting a planet moves the camera smoothly within its existing system over 900 ms. The star, sibling planets, orbits, geometry identities and orbital state remain intact. Clicking a group also animates the approach before entering its detail; interacting with the camera cancels the pending approach. Returning to the system restores the saved overview rather than rebuilding a one-object scene.
- Selected planets enable a gentle automatic camera orbit by default. The View tab can disable it without changing selection or language. Manual gestures briefly suspend the orbit; menus, flight, hierarchy/camera transitions and reduced motion suppress it. Its elapsed-time update keeps speed independent of the render budget.
- The unobtrusive hamburger opens one bounded, tabbed modal: Atlas, View, Controls and Settings. Search reaches every catalog planet regardless of camera scale; 24 results render per page, with accessible previous/next controls. Language changes preserve the current scene, menu tab, page and query. Escape opens the menu and pauses active flight; there is no standalone pause toolbar.
- The wider-view action steps through system, cloud, galaxy and universe. It disables the ship before showing a wider map. Physical camera zoom remains available through wheel/pinch; it is distinct from changing the logical grouping.
- The Space Jump presentation is temporarily disabled. Choosing another system navigates without a timed delay or full-screen travel dialog; normal camera focus and hierarchy morphs remain active. The travel hook and cutscene source are retained for future use but are not mounted by the explorer, so they schedule no timer and do not pause navigation.
- Third-person flight is optional and confined to the current system. Desktop input uses WASD, Q/E and Shift; touch controls appear on devices with coarse pointers. Opening the menu, hiding the page or losing focus clears held inputs. Leaving flight restores the map camera. Wider views never render the ship.

## Guided demo tour

`DemoUniverseHost` supplies an optional tour definition outside the canonical catalog schema. The automatic run waits for both scene readiness and the global welcome loader to close. It focuses Earth over 900 ms, then holds the arrived camera for three seconds with a gentle orbit when motion is enabled. Arrival acknowledgements start the hold; loading and camera approach do not consume it. The tour then widens through Solar System, Local Interstellar Cloud and Milky Way with 1,800 ms steps, finishing at the universe with a 2,200 ms step.

The once flag is `hackuniverse.demo-tour.v1.seen`, persisted before the first camera action. It is separate from the global intro's flag. View contains a manual replay action. Camera input, navigation, menu opening or hiding the page cancels the run; pending timers and stale arrival callbacks cannot advance a cancelled tour. Reduced motion skips automatic playback while allowing manual replay without camera tweening. This camera presentation does not enable Space Jump or measure loading progress.

## Scene detail and scale

Camera distance drives semantic navigation as well as optical zoom. Recent wheel/pinch input can move from a planet back to its intact system, then to its cloud, galaxy and universe. Enter/exit thresholds and a cooldown prevent bouncing between levels; camera tweens and piloting do not trigger these transitions. A validated user crossing survives a short cooldown instead of requiring another wheel impulse, and is consumed once or cancelled on reversal, navigation, menu or flight. Labels relay wheel input to the canvas. Zooming near the projected bounds of a group under the cursor or pinch midpoint can enter its detail. A normal system view does not automatically select a random planet when approaching its central star.

The universe overview sets the outer zoom limit, preventing indefinite pullback beyond its fitted scale. Mouse or pen hover over destinations or their labels at any scale shows a pointer cursor and cyan aura. The decorative aura does not select or navigate; dragging, menus, flight, tours and camera transitions suppress it.

Nested map detail comes from the actual catalog descendants. Wider cloud views represent systems as stars with small orbital detail; galaxies contain their system/cloud groups, and the universe contains galaxies. Shared, normalized layout scales keep parents visibly larger and farther apart than their contents. This is a synthetic navigable hierarchy, not a measured astronomical dataset, real parsec/AU map or gravitational simulation.

Crossing a hierarchy boundary preserves the camera angle and the previous world's screen projection. Shared preview layouts and orbital phases align the same descendants at both scales; a 720 ms overlap expands or collapses the detail while the outgoing context fades. Only one outgoing world is retained, then disposed. Outgoing labels and hit targets are removed, incoming labels wait for the handoff, and reduced motion replaces the view immediately. Continued gestures retain camera control while the overlap finishes; menu opening and subsequent navigation safely finalize it.

The star uses an original warm yellow/orange procedural surface and corona. A low-resolution procedural nebula panorama supplies the distant backdrop. Finite star layers and three soft nebula wisps move in perspective during dolly/pan; pulling back progressively reveals brighter, denser stars. Their transforms follow hierarchy handoffs, and direct-entry scales use the same shared preview ratios. One merged star draw contains 3,600 decorative points, with three additional shared-texture wisps and no per-frame geometry rebuild. These stars are background decoration, separate from catalog records and picking. UI accents and orbit lines remain cyan.

Galaxy particles use a soft circular mask with a bounded on-screen size, including close views. Decorative spiral dust rotates slowly; cloud haze and background wisps drift on the same motion clock as planetary orbits. These effects pause with the menu and reduced motion without moving the catalog's navigation anchors.

The 400 fictional planets keep their existing seeds and 100-color palette. The Solar System uses seven existing profiles plus one reserved gray Mercury preset: the intentionally ordinary exception, selected by visual seed rather than renderer ID checks. The same profile supplies the globe, system preview and atlas swatch; refresh, locale and camera changes never reroll it. Eight procedural surface families preserve the selected hue while varying terrain, bands, craters, ice and storms. Radius, axial tilt, material and optional rings also derive from the seed. Solar System sizes, spacing, surfaces and motion remain illustrative. Planet colors are independent of the cyan interface palette.

The first five orbital radii remain stable; additional orbits keep solid-body clearance for the largest profile. Each system batches its cyan orbit lines into one draw. All 20 mock planets can receive labels, with collision handling controlling their visibility and selection priority.

The starter ship is rendered at one quarter of its first prototype size: a maximum span of `.375` local units. Cruise/boost targets are `2`/`5` local units per second, with lighter vertical/turn rates. Original lightweight engine plumes respond to thrust/boost and clean up with the flight session. These are deliberate arcade tuning values, not physical orbital units.

During flight, selecting a planet keeps the pilot active and exposes a localized contextual guidance action. Guidance follows the moving target with a safe standoff and bounded obstacle avoidance; manual movement cancels it. Pausing preserves a destination without accumulating movement, and leaving the system or losing the target cancels the approach. It never starts imports or creates catalog content.

## Module boundaries

`UniverseHost` receives a validated canonical catalog and supplies localization, branding, navigation links and a dynamically imported renderer. `DemoUniverseHost` chooses the default dataset for the home route; the generic host does not import it. Core adapters are consumer-owned, and feature composition uses the navigation hook and pure UI. Supplier normalization stays outside the domain and renderer; the default JSON is already canonical. See [the data guide](UNIVERSE-DATA.md) for the parser, public import boundary and optional Firecrawl adapter.

The renderer owns scene/camera/input lifecycles and receives a provider-free scene projection. Detail UI uses canonical name/description and optional reference metadata, including objects without URLs. Demo mode controls illustrative labels and suppresses outbound reference actions; it is not inferred from a supplier name. No view starts imports or creates catalog data.

Three.js and OrbitControls load only for the home renderer. GLTFLoader and the starter spacecraft load only after an explicit flight request. The ship helper owns the chase camera while loading or flying; the map controller suspends its own camera writers until that ownership ends. Stale model loads are aborted or disposed, and all GPU resources, observers, input listeners and animation frames are cleaned up on disposal.

## Performance and accessibility

The scene uses shared low-segment geometry, original 128/256-pixel procedural planet textures, a point starfield, capped device pixel ratio and no remote planet images, shadow maps or expensive bloom stack. The render loop targets 30 frames per second for normal motion and allows 60 while interacting; those are configured budgets, not measured physical-device guarantees. Hidden/offscreen views suspend rendering; paused/reduced-motion scenes render on demand outside active flight.

Labels provide 44-pixel targets, collision handling and reserved HUD space. The atlas and controls remain usable when WebGL is unavailable. Reduced motion removes orbital animation and camera tweening. Modals retain keyboard focus, bounded scrolling and translated accessible labels. Browser viewport tests do not establish physical iPhone/Android FPS, battery use or thermal behavior.

## References and ownership

- [3D Solar System Three.js reference](https://github.com/SoumyaEXE/3d-Solar-System-ThreeJS), inspected revision `0d305aec31db5328c66a6d3e66da444dce8bc6dc`: orbital composition, camera interaction and scene hierarchy. The implementation here is original; its large textures, API integrations and credentials are not imported.
- [ARK Starmap](https://robertsspaceindustries.com/en/starmap?camera=10,0,0.4,0,0): wide map, system inspection, contextual planet zoom, restrained cyan markers, camera continuity and cinematic transitions.
- [Official ARK development article](https://robertsspaceindustries.com/en/comm-link/spectrum-dispatch/15000-The-ARK-Starmap) and [the creators' technical presentation](https://speakerdeck.com/turbulent/starmap-journey-through-a-webgl-project): useful historical architecture references. Public HTML and delivered bundles were inspected; this is not access to the private repository or complete backend source. Use current Three.js, not the legacy embedded revision.

No RSI code, maps, textures, music, logos or sound effects are shipped. Music and sound effects will be original assets; see the GitHub immersive-exploration roadmap. [Asset credits](ASSET-CREDITS.md) cover the licensed starter ship.
