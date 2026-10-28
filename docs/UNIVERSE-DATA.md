# Universe catalog contract

The explorer consumes one application-owned, provider-neutral catalog. A supplier adapter converts its own input into this contract; the domain, navigation, UI and renderer do not consume supplier responses. The default [demo-universe.json](../web/src/modules/universe/data/demo-universe.json) is already canonical JSON, with no search envelopes or provider fields.

## Document and validated catalog

Import the pure public boundary without loading the default fixture, a supplier adapter or UI:

```ts
import {
  parseUniverseCatalog,
  type UniverseCatalogDocument,
} from "@/modules/universe/domain";

function loadCatalog(document: UniverseCatalogDocument) {
  return parseUniverseCatalog(document);
}
```

`UniverseCatalogDocument` contains `schemaVersion: 1`, `mode: "demo" | "live"`, `rootId`, an optional `{ kind, id }` `initialTarget`, and an ordered `entities` array. Every entity has an application-owned `id`, `kind`, `parentId`, `name`, `description` and numeric visual `seed`.

The five kinds form a strict hierarchy: `universe → galaxy → cloud → system → planet`. Exactly one universe is the declared root and has a null parent. Every other entity must resolve to a parent of the preceding kind. Groups can be empty; the contract does not require a system or any planets.

`UniverseGroup` covers the four grouping kinds. `UniversePlanet` adds an optional `reference: { label, href? }` and optional string `tags`. A planet need not be a website or have a URL. Provider names, operations, raw payloads, search queries and rankings are not canonical fields. When a discovery term is useful to the application, an adapter can project it into neutral tags.

Every entity may explicitly carry `type: "demo"`. Absence means an ordinary object; neither catalog `mode` nor an ancestor's type assigns it implicitly. The parser accepts only this supported type when supplied, and adapters preserve an explicit application classification rather than deriving it from a supplier response. All 528 bundled entities currently carry the flag.

This classification does not implement visibility, ownership or authorization. No hide-demo filter exists yet. A future filtered catalog must preserve a valid root and the ancestors needed by retained ordinary objects, then derive children and counts from the retained records. Hiding a marked ancestor must not discard its ordinary descendants; CSS-only hiding is not a data filter or an authorization boundary.

System groups may also carry optional `star: SystemStar` metadata: required name/description and optional spectral type, effective temperature in kelvin, radius in kilometers, age in billions of years and a reference. This metadata is allowed only on systems; unknown facts can be omitted. It is projected and frozen with the catalog, without creating another entity or planet.

The validated `UniverseCatalog` resolves a required `initialTarget`, defaulting to the root, and derives a readonly `planets` array from the entities. Each derived planet is the same object as its entry in `entities`; callers do not maintain a second set of records. Entity and planet order is preserved.

## Parse at the boundary

[parseUniverseCatalog](../web/src/modules/universe/domain/parse-catalog.ts) accepts `unknown`, validates it and creates owned canonical objects. It freezes the catalog, initial target, entity/planet arrays, entities, references and tags. Mutating the input afterward does not change the validated result. Unknown fields are omitted rather than forwarded, and validation errors do not echo rejected payload or URL values.

Validation enforces:

- Unique, nonblank opaque IDs of at most 256 characters, without control characters. IDs may contain meaningful punctuation and are not restricted to one supplier's format.
- Nonblank names and reference labels of at most 160 characters; descriptions may be empty and contain at most 4,000 characters. Seeds are unsigned 32-bit integers.
- At most 32 tags, each a string of at most 1,000 characters.
- Exactly one declared root, supported kinds, strict parent relationships and a resolvable initial target whose kind matches its entity.
- Optional reference links that normalize to HTTPS URLs without userinfo or control characters. Meaningful ports, queries and fragments are allowed.

Duplicate reference links are valid: generic object identity comes from the application ID, not the href. Website-specific deduplication belongs in the website adapter. URL validation preserves meaningful parameters and is not a secret-removal mechanism; adapters must supply safe, shareable canonical links rather than signed or credential-bearing URLs.

An empty universe is a valid document and starts at its root:

```json
{
  "schemaVersion": 1,
  "mode": "live",
  "rootId": "empty-universe",
  "entities": [
    { "id": "empty-universe", "kind": "universe", "parentId": null, "name": "My universe", "description": "", "seed": 1 }
  ]
}
```

The bundled demo is not an account seed or database migration. New production accounts still start with zero planets.

## Objects without URLs

The [document catalog example](../web/src/modules/universe/data/examples/document-catalog.json) provides a complete hierarchy with a local document planet. Its reference has a label and no href:

```json
{
  "id": "document-field-notes",
  "kind": "planet",
  "parentId": "document-system",
  "name": "Field Notes",
  "description": "A fictional local document about landscape observations.",
  "seed": 205,
  "reference": { "label": "Notebook / Field Notes" },
  "tags": ["fieldwork", "local document"]
}
```

References and tags can also be omitted entirely. Planet details use the canonical name and description, show reference metadata only when present, and do not construct a URL for a URLless object. Demo planet references remain illustrative and have no outbound action; a validated live planet href can expose an external link. System-star source links are separate factual references and can remain available in the demo.

## Default source and host composition

The [default catalog adapter](../web/src/modules/universe/adapters/catalog/index.ts) imports the canonical demo JSON and parses it once. `DemoUniverseHost` selects that dataset for `/`; the reusable `UniverseHost` requires an already validated `catalog` prop and does not choose a supplier or import the fixture itself. Both hosts are available through `@/modules/universe/host`.

The fixture contains **458 planets and 528 total entities**: 400 fictional website records, eight Solar System planets and 50 illustrative orbital bodies across ten real-named neighboring objects. It has one universe, five galaxies, thirteen clouds and fifty-one systems. The original four fictional galaxies retain 100 planets each across ten systems whose sizes are a permutation of `20, 15, 12, 10, 10, 8, 8, 6, 6, 5`. The initial target remains `{ kind: "planet", id: "planet-earth" }`. These are current data values, not runtime quotas.

The added hierarchy is `Milky Way → Solar Neighborhood → Solar System` and ten neighboring map markers, each with five invented bodies. Solar Neighborhood retains the stable ID `cloud-local-interstellar`; its display rename does not change identity. These named markers and their layouts are not a confirmed exoplanet inventory, a physical interstellar-cloud model or measured distances. The Solar System's ordered records are Mercury, Venus, Earth, Mars, Jupiter, Saturn, Uranus and Neptune, with URLless references.

The Solar System's nested star is named Sun. Its `G2 V` spectral type, `5772 K` effective temperature and `695700 km` mean radius follow [NASA's Sun Fact Sheet](https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html). Its approximate age of `4.6` billion years and displayed reference follow [NASA Sun facts](https://science.nasa.gov/sun/facts/). The Sun is not an additional entity or planet, so the planet count stays 458. Other systems can provide descriptive star metadata without inventing measured physical facts.

The provider-neutral migration preserved the original 400 planet records and 457 entities, including IDs, parents, seeds, names, descriptions and ordering. Solar System and neighborhood records were appended without changing that original sequence or rerolling existing seeds. Previous synthetic discovery queries became tags, and previous URLs became reference hrefs with hostname labels. The reserved `.example` links remain fictional. No provider response is required to edit the fixture, and loading it makes no provider, favicon, screenshot or content requests.

Keep IDs, parents, seeds and child ordering stable when editing display content. They control selection, deterministic appearance, orbital placement, hierarchy previews and camera continuity. A rendered central star is a selectable system anchor backed by optional system metadata, not another catalog record.

## Supplier adapters

The optional Firecrawl search normalizer has its own public entry:

```ts
import { parseUniverseCatalog } from "@/modules/universe/domain";
import {
  normalizeFirecrawlSearch,
  type FirecrawlSearchInput,
} from "@/modules/universe/adapters/catalog/firecrawl";

function catalogFromSearch(input: FirecrawlSearchInput) {
  return parseUniverseCatalog(normalizeFirecrawlSearch(input));
}
```

The [synthetic input example](../web/src/modules/universe/data/examples/firecrawl-search.json) includes application-owned groups, destination systems, IDs and visual seeds separately from a `success`/`data.web` search response. A batch's mapping connects each one-based result position to an application planet ID and seed. Mapping order is retained; provider ranking never defines object identity.

The normalizer validates supplier response shape, success, batch IDs, complete unique mappings, optional result positions, destination systems, result metadata and duplicate normalized website URLs. It projects title/description into canonical name/description, URL into a reference, and query into tags. Explicit group/mapping demo types and system-star context come from the application, not the provider ranking or catalog mode. Raw response fields and provider credentials are not copied. It rejects recognizable credential/signature parameters rather than silently stripping them; callers remain responsible for safe source data. The canonical parser then validates and freezes the resulting application tree.

This is a local transformation, not a live integration: it performs no fetch, SDK call, import job or persistence. Additional suppliers implement the same outward document contract in their own adapters; they do not add supplier fields to domain types or conditionals to the renderer.

## Selectors and scene projection

[catalog.ts](../web/src/modules/universe/domain/catalog.ts) contains pure selectors. Entity, parent, children and breadcrumb lookups use the authoritative hierarchy. `findPlanet` resolves a canonical planet, and `getPlanetCount` counts planet descendants without adding a visual star. Scene projection builds local identity, children and count indexes once per call, avoiding repeated ancestor scans while retaining no shared cache between catalogs. Search matches every whitespace-separated term against name, description, optional reference label/href and tags; an empty search returns all planets in stable order.

`getSceneView` projects only rendering fields: stable IDs, kinds, labels, counts, seeds, colors and nested descendants. Selecting a planet returns its complete parent-system view with the same scene key, mode, nodes and star name. The camera focuses within that world while siblings, geometry and orbital state survive. Group keys remain `${kind}:${id}`; suppliers do not replace them with request IDs or rankings. Empty groups yield empty nodes, and unknown targets yield an empty cluster view.

Interface localization does not translate or rewrite catalog content, labels, tags or reference links. Camera, appearance and rendering details are documented separately in [the explorer guide](UNIVERSE-EXPLORER.md).

## Validation

From `web/`, run `npm run test:catalog`. Native Node tests cover canonical and supplier boundaries, URLless/empty catalogs, hierarchy and input failures, safe projection, immutability, derived identity, adapter conversion and projection isolation. The runner compiles tests with the existing TypeScript dependency into ignored `.catalog-tests/` output. Fixture parity was also checked against the pre-migration 400-record dataset; no duplicate legacy fixture is committed. `npm run test:scene` separately checks tour continuity, distance bounds and shared orbital motion.
