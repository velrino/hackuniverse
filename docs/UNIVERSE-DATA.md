# Universe demo catalog

The immersive home reads one synthetic, local catalog from [demo-universe.json](../web/src/modules/universe/data/demo-universe.json). The current fixture contains **400 fictional website planets**, organized as one universe, four galaxies, twelve clouds, and forty systems. Each galaxy has three clouds containing three, three, and four systems respectively, with 100 planets per galaxy. Its ten system sizes are a permutation of `20, 15, 12, 10, 10, 8, 8, 6, 6, 5`: current systems therefore contain between five and twenty planets. The initial Web Intelligence system contains twelve. These are the current data's counts, not runtime quotas: editing the JSON can add or remove groups and website records without changing application code. This is an explicitly marked `mode: "demo"` dataset. It is not an account seed, a database migration, a real Firecrawl response, or evidence that an import occurred. New production accounts still start with zero planets.

## Edit the fixture

- `hierarchy` owns the grouping entities, currently 57. Their parent chain is `universe → galaxy → cloud → system`; each website planet belongs to one system. Galaxies, clouds, and systems can be empty. Keep a valid `initialSystemId` even when that system has no planets.
- `searchBatches` currently holds forty synthetic batches. A system may have no batches or several. Each batch has an app-owned ID, destination `systemId`, search `query`, and a separate `mapping` list. Mapping entries connect a result's one-based position to a stable planet ID and numeric visual seed. A batch can contain any number of results, including zero, and every result needs exactly one mapping.
- `response` follows the Firecrawl v2 search envelope: `success: true`, then `data.web` with result `url`, `title`, and `description`. The application hierarchy never appears inside provider results. Search discovers metadata; these fixtures do not claim crawled pages, content snapshots, screenshots, or completed jobs.
- `source.position` is an application-assigned synthetic ranking derived from `data.web` order and the mapping. A web result need not supply `position`; if one is included in an edited fixture, it must agree with that order. It is not treated as a guaranteed Firecrawl web-result field. See the [official search contract](https://docs.firecrawl.dev/api-reference/endpoint/search).
- All URLs use reserved `.example` hosts. They are fictional source identifiers, not real links or targets for network requests. The catalog performs no API, favicon, image, or screenshot requests.
- Keep IDs and seeds stable when editing titles or descriptions. The numeric seeds determine repeatable scene placement and color. Reordering a batch's provider results requires updating its mapping positions too.
- `rootId` selects the universe; `initialSystemId` selects the initial scene. A rendered star is only a system's visual anchor, named after that system. It has no website record, entity ID, source URL, or separate product kind.

## Runtime boundary

The [catalog adapter](../web/src/modules/universe/adapters/catalog/index.ts) parses and validates the JSON once when imported. It maps provider-shaped metadata into app-owned [domain types](../web/src/modules/universe/domain/types.ts). `entities` contains all groups and planets; `planets` references the same planet objects with their source metadata. The current fixture has 457 total nodes and 400 planets. Consumers should treat the catalog as read-only.

Validation rejects unsupported schema/mode, duplicate IDs or canonical URLs, invalid parents, unknown destination systems, missing root or initial system, incomplete/duplicate/out-of-range result mappings, inconsistent optional provider positions, malformed seeds, and non-demo URLs. It does not freeze group counts or the number of planets in a system. Positions must cover `1..response.data.web.length` exactly once; empty results require an empty mapping. The finite bundled JSON asset defines this demo's size. Future live-input byte limits and rendering budgets belong at their respective boundaries, rather than being disguised as fixture-size validation.

## Pure selectors

[catalog.ts](../web/src/modules/universe/domain/catalog.ts) contains no React, storage, provider SDK, initialized client, or mutable cache. Selectors accept a catalog and either an ID or a `{ kind, id }` target; mismatched kinds are rejected.

- `getEntity`, `getParent`, `getChildren`, and `getBreadcrumbs` resolve the same authoritative hierarchy. Breadcrumbs include the current entity in root-to-current order.
- `findPlanet` returns the source-bearing planet. `getPlanetCount` counts website descendants; a planet counts as one and a star never adds to the count.
- `searchPlanets` searches all website records regardless of the current scene, matching every whitespace-separated search term against title, description, URL, or synthetic query. An empty search returns all planets in stable catalog order.
- `getSceneView` returns direct child groups for cluster views, or that system's website planets and an optional visual star name for a system. Selecting a planet returns its parent's complete system view with the same scene key, mode, nodes, and star name: selection only focuses the camera, preserving the surrounding planets and star. The navigation target remains the planet for its details and breadcrumbs. Empty groups produce empty node arrays. Every scene key and node seed is stable. Unknown targets return an empty cluster view, not another account or catalog.

Source names, queries, descriptions, and URLs remain English catalog content. Interface localization does not translate or rewrite website metadata. Keep synthetic provenance visible in the host UI; do not describe this catalog as persistent user data or a working ingestion integration.
