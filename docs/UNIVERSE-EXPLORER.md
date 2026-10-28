# Immersive universe demo

The home route is an explicitly synthetic, full-viewport 3D explorer. It currently reads 200 fictional website records from [the editable catalog](../web/src/modules/universe/data/demo-universe.json). See [the data contract](UNIVERSE-DATA.md) for the Firecrawl-shaped envelopes and app-owned grouping. This creates no accounts, persisted planets, jobs, or provider requests.

## Interaction contract

- A planet is a website. Systems and stellar clouds are additional visual groupings in this demo, under galaxies and a universe. The rendered star is a system anchor, not another website record. These view groupings do not silently change the planned persistent account/catalog model.
- Selecting a planet moves the camera smoothly within its existing system over 900 ms. The star, sibling planets, orbits, geometry identities and orbital state remain intact. Clicking a group also animates the approach before entering its detail; interacting with the camera cancels the pending approach. Returning to the system restores the saved overview rather than rebuilding a one-object scene.
- The unobtrusive hamburger opens one bounded, tabbed modal: Atlas, View, Controls and Settings. Search reaches every catalog planet regardless of camera scale; 24 results render per page, with accessible previous/next controls. Language changes preserve the current scene, menu tab, page and query. Escape opens the menu and pauses active flight; there is no standalone pause toolbar.
- The wider-view action steps through system, cloud, galaxy and universe. It disables the ship before showing a wider map. Physical camera zoom remains available through wheel/pinch; it is distinct from changing the logical grouping.
- Choosing a different system performs a three-second presentation jump. Skip reaches the same validated destination immediately; cancel/Escape retains the previous location. Timers clean up on cancellation and unmount. This animation is not a measure of Firecrawl work or network progress.
- Third-person flight is optional and confined to the current system. Desktop input uses WASD, Q/E and Shift; touch controls appear on devices with coarse pointers. Opening the menu, hiding the page or losing focus clears held inputs. Leaving flight restores the map camera. Wider views never render the ship.

## Scene detail and scale

Camera distance drives semantic navigation as well as optical zoom. Recent wheel/pinch input can move from a planet back to its intact system, then to its cloud, galaxy and universe. Enter/exit thresholds and a cooldown prevent bouncing between levels; camera tweens and piloting do not trigger these transitions. Zooming in near a grouping under the cursor or pinch midpoint can enter its detail. A normal system view does not automatically select a random planet when approaching its central star.

Nested map detail comes from the actual catalog descendants. Wider cloud views represent systems as stars with small orbital detail; galaxies contain their system/cloud groups, and the universe contains galaxies. Shared, normalized layout scales keep parents visibly larger and farther apart than their contents. This is a synthetic navigable hierarchy, not a measured astronomical dataset, real parsec/AU map or gravitational simulation.

Crossing a hierarchy boundary preserves the camera angle and the previous world's screen projection. Shared preview layouts and orbital phases align the same descendants at both scales; a 720 ms overlap expands or collapses the detail while the outgoing context fades. Only one outgoing world is retained, then disposed. Outgoing labels and hit targets are removed, incoming labels wait for the handoff, and reduced motion replaces the view immediately. Camera interaction, menu opening and subsequent navigation safely finish the overlap.

The star uses an original warm yellow/orange procedural surface and corona. A low-resolution procedural nebula panorama supplies the distant backdrop. Finite star layers and three soft nebula wisps move in perspective during dolly/pan; pulling back progressively reveals brighter, denser stars. Their transforms follow hierarchy handoffs, and direct-entry scales use the same shared preview ratios. One merged star draw contains 3,600 decorative points, with three additional shared-texture wisps and no per-frame geometry rebuild. These stars are background decoration, separate from catalog records and picking. UI accents and orbit lines remain cyan.

The starter ship is rendered at one quarter of its first prototype size: a maximum span of `.375` local units. Cruise/boost targets are `2`/`5` local units per second, with lighter vertical/turn rates. Original lightweight engine plumes respond to thrust/boost and clean up with the flight session. These are deliberate arcade tuning values, not physical orbital units.

During flight, selecting a planet keeps the pilot active and exposes a localized contextual guidance action. Guidance follows the moving target with a safe standoff and bounded obstacle avoidance; manual movement cancels it. Pausing preserves a destination without accumulating movement, and leaving the system or losing the target cancels the approach. It never starts imports or creates catalog content.

## Module boundaries

`UniverseHost` supplies the catalog, localization, branding, navigation links and a dynamically imported renderer. Core adapters are consumer-owned; feature composition uses navigation/travel hooks and pure UI. Provider-shaped mock data is parsed once by the catalog adapter. The renderer owns only scene/camera/input lifecycles and does not start imports or create catalog data.

Three.js and OrbitControls load only for the home renderer. GLTFLoader and the starter spacecraft load only after an explicit flight request. The ship helper owns the chase camera while loading or flying; the map controller suspends its own camera writers until that ownership ends. Stale model loads are aborted or disposed, and all GPU resources, observers, input listeners and animation frames are cleaned up on disposal.

## Performance and accessibility

The scene uses shared low-segment geometry, original 128/256-pixel procedural planet textures, a point starfield, capped device pixel ratio and no remote planet images, shadow maps or expensive bloom stack. The render loop targets 30 frames per second for normal motion and allows 60 while interacting; those are configured budgets, not measured physical-device guarantees. Hidden/offscreen views suspend rendering; paused/reduced-motion scenes render on demand outside active flight.

Labels provide 44-pixel targets, collision handling and reserved HUD space. The atlas and controls remain usable when WebGL is unavailable. Reduced motion removes orbital animation and camera tweening and offers a quiet travel transition. Modals retain keyboard focus, bounded scrolling and translated accessible labels. Browser viewport tests do not establish physical iPhone/Android FPS, battery use or thermal behavior.

## References and ownership

- [3D Solar System Three.js reference](https://github.com/SoumyaEXE/3d-Solar-System-ThreeJS), inspected revision `0d305aec31db5328c66a6d3e66da444dce8bc6dc`: orbital composition, camera interaction and scene hierarchy. The implementation here is original; its large textures, API integrations and credentials are not imported.
- [ARK Starmap](https://robertsspaceindustries.com/en/starmap?camera=10,0,0.4,0,0): wide map, system inspection, contextual planet zoom, restrained cyan markers, camera continuity and cinematic transitions.
- [Official ARK development article](https://robertsspaceindustries.com/en/comm-link/spectrum-dispatch/15000-The-ARK-Starmap) and [the creators' technical presentation](https://speakerdeck.com/turbulent/starmap-journey-through-a-webgl-project): useful historical architecture references. Public HTML and delivered bundles were inspected; this is not access to the private repository or complete backend source. Use current Three.js, not the legacy embedded revision.

No RSI code, maps, textures, music, logos or sound effects are shipped. Music and sound effects will be original assets; see the GitHub immersive-exploration roadmap. [Asset credits](ASSET-CREDITS.md) cover the licensed starter ship.
