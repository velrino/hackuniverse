import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import authoring from "../../../data/demo-universe.json";
import { getBreadcrumbs, getSceneView } from "../../../domain/catalog";
import { parseUniverseCatalog } from "../../../domain/parse-catalog";
import type { EntityKind, UniverseCatalogDocument } from "../../../domain/types";
import { normalizeDemoCatalog } from "./index";

const marker = "SYNTHETIC_ONLY_SECRET";
const fields = (id: string, seed: number) => ({ id, name: `Name ${id}`, description: `Description ${id}`, seed });

function source() {
  return {
    catalog: { schemaVersion: 1, mode: "demo", initialTarget: { kind: "planet", id: "planet-z" } },
    universe: {
      ...fields("universe-z", 1), type: "demo", raw: marker,
      galaxies: [{
        ...fields("galaxy-z", 2),
        clouds: [{
          ...fields("cloud-z", 3),
          systems: [{
            ...fields("system-z", 4),
            star: {
              name: "Example star", description: "Synthetic star metadata.", spectralType: "G2 V", temperatureK: 5772,
              reference: { label: "Star source", href: "https://CATALOG.example:443/star", raw: marker }, raw: marker,
            },
            planets: [
              { ...fields("planet-z", 5), type: "demo", reference: { label: "Reference", href: "https://CATALOG.example:443/planet?view=notes#facts", raw: marker }, tags: ["shared", "notes"], raw: marker },
              { ...fields("planet-a", 6) },
            ],
          }, { ...fields("system-a", 7), planets: [] }],
        }],
      }, { ...fields("galaxy-a", 8), clouds: [] }],
    },
    provenance: { provider: marker, raw: { credentials: marker } },
  };
}

function replaceSystem(patch: Record<string, unknown>) {
  const value = source();
  const galaxy = value.universe.galaxies[0];
  const cloud = galaxy.clouds[0];
  return {
    ...value,
    universe: { ...value.universe, galaxies: [{
      ...galaxy, clouds: [{ ...cloud, systems: [{ ...cloud.systems[0], ...patch }] }],
    }] },
  };
}

test("organized demo authoring becomes the same canonical document as direct supplier-neutral input", () => {
  const expected: UniverseCatalogDocument = {
    schemaVersion: 1, mode: "demo", rootId: "universe-z", initialTarget: { kind: "planet", id: "planet-z" },
    entities: [
      { ...fields("universe-z", 1), kind: "universe", parentId: null, type: "demo" },
      { ...fields("galaxy-z", 2), kind: "galaxy", parentId: "universe-z" },
      { ...fields("cloud-z", 3), kind: "cloud", parentId: "galaxy-z" },
      { ...fields("system-z", 4), kind: "system", parentId: "cloud-z", star: {
        name: "Example star", description: "Synthetic star metadata.", spectralType: "G2 V", temperatureK: 5772,
        reference: { label: "Star source", href: "https://catalog.example/star" },
      } },
      { ...fields("planet-z", 5), kind: "planet", parentId: "system-z", type: "demo", reference: { label: "Reference", href: "https://catalog.example/planet?view=notes#facts" }, tags: ["shared", "notes"] },
      { ...fields("planet-a", 6), kind: "planet", parentId: "system-z" },
      { ...fields("system-a", 7), kind: "system", parentId: "cloud-z" },
      { ...fields("galaxy-a", 8), kind: "galaxy", parentId: "universe-z" },
    ],
  };
  const normalized = normalizeDemoCatalog(source());
  assert.deepEqual(normalized, expected);
  assert.deepEqual(Object.keys(normalized), ["schemaVersion", "mode", "rootId", "initialTarget", "entities"]);
  assert.ok(!JSON.stringify(normalized).includes(marker), "provenance and raw provider fields never enter the domain");
  const catalog = parseUniverseCatalog(normalized);
  assert.deepEqual(catalog, parseUniverseCatalog(expected));
  assert.deepEqual(catalog.planets.map(({ id, seed }) => ({ id, seed })), [{ id: "planet-z", seed: 5 }, { id: "planet-a", seed: 6 }]);
  assert.equal(catalog.entities.find(({ id }) => id === "planet-a")?.type, undefined, "mode does not infer per-object classification");
  assert.deepEqual(getSceneView(catalog, "system-z"), getSceneView(catalog, "planet-z"));
  assert.deepEqual(getSceneView(catalog, "system-a").nodes, []);
});

test("matching explicit kinds preserve canonical parity with legacy implicit authoring", () => {
  const legacy = source();
  const explicit = {
    ...legacy,
    universe: {
      ...legacy.universe, kind: "universe",
      galaxies: legacy.universe.galaxies.map((galaxy) => ({
        ...galaxy, kind: "galaxy",
        clouds: galaxy.clouds.map((cloud) => ({
          ...cloud, kind: "cloud",
          systems: cloud.systems.map((system) => ({
            ...system, kind: "system",
            planets: system.planets.map((planet) => ({ ...planet, kind: "planet" })),
          })),
        })),
      })),
    },
  };
  assert.deepEqual(normalizeDemoCatalog(explicit), normalizeDemoCatalog(legacy));
  assert.deepEqual(parseUniverseCatalog(normalizeDemoCatalog(explicit)), parseUniverseCatalog(normalizeDemoCatalog(legacy)));
});

test("normalized nested values are owned and empty authoring defaults to its root", () => {
  const original = source();
  const normalized = normalizeDemoCatalog(original);
  const system = original.universe.galaxies[0].clouds[0].systems[0];
  assert.ok("star" in system);
  const planet = system.planets[0];
  assert.ok("tags" in planet && "reference" in planet);
  system.star.name = "Changed star";
  planet.tags.push("Changed tag");
  planet.reference.href = "https://changed.example/";
  const actual = parseUniverseCatalog(normalized);
  assert.equal(actual.entities.find((entity) => entity.kind === "system" && entity.id === "system-z")?.kind, "system");
  const star = actual.entities.find((entity) => entity.kind === "system" && entity.id === "system-z");
  assert.ok(star?.kind === "system");
  assert.equal(star.star?.name, "Example star");
  assert.deepEqual(actual.planets[0].tags, ["shared", "notes"]);
  assert.equal(actual.planets[0].reference?.href, "https://catalog.example/planet?view=notes#facts");
  assert.ok(Object.isFrozen(normalized.entities) && Object.isFrozen(normalized.entities[3]));

  const empty = normalizeDemoCatalog({ catalog: { schemaVersion: 1, mode: "demo" }, universe: { ...fields("empty", 9), galaxies: [] } });
  assert.deepEqual(empty.initialTarget, { kind: "universe", id: "empty" });
  assert.deepEqual(parseUniverseCatalog(empty).planets, []);
});

test("invalid authoring and canonical values fail without echoing rejected payloads", async (t) => {
  const supplied = source();
  const planet = supplied.universe.galaxies[0].clouds[0].systems[0].planets[0];
  const cases: readonly [string, unknown][] = [
    ["missing metadata", { universe: supplied.universe, provenance: marker }],
    ["unsupported mode", { ...supplied, catalog: { ...supplied.catalog, mode: marker } }],
    ["unsupported version", { ...supplied, catalog: { ...supplied.catalog, schemaVersion: marker } }],
    ["invalid root", { ...supplied, universe: marker }],
    ["missing collection", { ...supplied, universe: { ...fields("empty", 1), galaxies: undefined } }],
    ["wrong collection", replaceSystem({ planets: marker })],
    ["misplaced collection", replaceSystem({ galaxies: [] })],
    ["unsupported kind", replaceSystem({ kind: marker })],
    ["mismatched system kind", replaceSystem({ kind: "planet" })],
    ["mismatched root kind", { ...supplied, universe: { ...supplied.universe, kind: "galaxy" } }],
    ["non-string kind", replaceSystem({ kind: { value: marker } })],
    ["null kind", replaceSystem({ kind: null })],
    ["explicit undefined kind", replaceSystem({ kind: undefined })],
    ["authored parent", replaceSystem({ parentId: marker })],
    ["matching authored parent", replaceSystem({ kind: "system", parentId: "cloud-z" })],
    ["duplicate IDs", replaceSystem({ planets: [planet, { ...planet }] })],
    ["duplicate root ID", replaceSystem({ planets: [{ ...planet, id: "universe-z" }] })],
    ["invalid seed", replaceSystem({ seed: marker })],
    ["invalid star", replaceSystem({ star: marker })],
    ["invalid reference", replaceSystem({ planets: [{ ...planet, reference: { label: "Reference", href: `https://${marker}@catalog.example/` } }] })],
    ["missing target", { ...supplied, catalog: { ...supplied.catalog, initialTarget: { kind: "planet", id: marker } } }],
    ["misplaced star", { ...supplied, universe: { ...supplied.universe, star: { name: marker, description: marker } } }],
    ["misplaced planet metadata", { ...supplied, universe: { ...supplied.universe, reference: { label: marker } } }],
  ];
  for (const [name, input] of cases) {
    await t.test(name, () => assert.throws(() => normalizeDemoCatalog(input), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(marker), "validation messages must not echo authored payload values");
      return true;
    }));
  }
});

test("every bundled authored node exposes its canonical kind for filtering and counts", () => {
  const authoredCounts: Record<EntityKind, number> = { universe: 0, galaxy: 0, cloud: 0, system: 0, planet: 0 };
  const branches = [["galaxies", "galaxy"], ["clouds", "cloud"], ["systems", "system"], ["planets", "planet"]] as const;
  function inspect(value: unknown, expectedKind: EntityKind) {
    assert.ok(value && typeof value === "object" && !Array.isArray(value));
    const node = value as Record<string, unknown>;
    assert.ok(Object.hasOwn(node, "kind"), "every authored catalog entity declares its own kind");
    assert.equal(node.kind, expectedKind, "an explicit kind identifies the object's hierarchy role");
    assert.equal(node.type, "demo", "demo classification is separate from the entity kind");
    authoredCounts[expectedKind]++;
    for (const [field, childKind] of branches) {
      if (node[field] === undefined) continue;
      assert.ok(Array.isArray(node[field]));
      for (const child of node[field]) inspect(child, childKind);
    }
  }
  inspect(authoring.universe, "universe");
  const expectedCounts = { universe: 1, galaxy: 20, cloud: 32, system: 450, planet: 767 };
  assert.deepEqual(authoredCounts, expectedCounts);
  const canonicalCounts: Record<EntityKind, number> = { universe: 0, galaxy: 0, cloud: 0, system: 0, planet: 0 };
  for (const entity of normalizeDemoCatalog(authoring).entities) canonicalCounts[entity.kind]++;
  assert.deepEqual(canonicalCounts, expectedCounts, "canonical filtering retains the authored entity kinds and counts");
});

test("the bundled factual demo preserves Solar identity and keeps curated scene bounds", () => {
  const document = normalizeDemoCatalog(authoring);
  const catalog = parseUniverseCatalog(document);
  assert.equal(catalog.mode, "demo");
  assert.equal(catalog.rootId, "universe-demo-atlas");
  assert.deepEqual(catalog.initialTarget, { kind: "planet", id: "planet-earth" });
  assert.ok(catalog.entities.every((entity) => entity.type === "demo" && entity.name.trim() && entity.description.trim()));
  assert.ok(catalog.planets.length > 8 && catalog.planets.length <= 1024);
  assert.equal(new Set(catalog.planets.map(({ name }) => name)).size, catalog.planets.length, "a factual planet is not duplicated under another ID");
  const systems = catalog.entities.filter((entity) => entity.kind === "system");
  assert.ok(systems.length > 1 && systems.length - 1 <= 512, "at most 512 curated exoplanet host systems");
  assert.equal(new Set(systems.map(({ name }) => name)).size, systems.length, "a factual host is not duplicated into multiple regions");
  for (const region of catalog.entities.filter((entity) => entity.kind === "cloud")) {
    assert.ok(systems.filter((system) => system.parentId === region.id).length <= 16, "each visual region has at most 16 systems");
  }
  const solar = catalog.planets.filter(({ parentId }) => parentId === "system-solar");
  assert.deepEqual(solar.map(({ id, name, seed }) => ({ id, name, seed })), [
    { id: "planet-mercury", name: "Mercury", seed: 195956 },
    { id: "planet-venus", name: "Venus", seed: 250848 },
    { id: "planet-earth", name: "Earth", seed: 102729 },
    { id: "planet-mars", name: "Mars", seed: 294251 },
    { id: "planet-jupiter", name: "Jupiter", seed: 135039 },
    { id: "planet-saturn", name: "Saturn", seed: 172995 },
    { id: "planet-uranus", name: "Uranus", seed: 240172 },
    { id: "planet-neptune", name: "Neptune", seed: 105756 },
  ]);
  assert.deepEqual(getBreadcrumbs(catalog, "planet-earth").map(({ id }) => id), [
    "universe-demo-atlas", "galaxy-milky-way", "cloud-local-interstellar", "system-solar", "planet-earth",
  ]);
  const expectedSeeds: Record<string, number> = {
    "universe-demo-atlas": 3983766564, "galaxy-milky-way": 3500290604,
    "cloud-local-interstellar": 2328254348, "system-solar": 2283689132,
  };
  for (const [id, seed] of Object.entries(expectedSeeds)) assert.equal(catalog.entities.find((entity) => entity.id === id)?.seed, seed);
  for (const id of ["galaxy-discovery", "galaxy-creation", "galaxy-inquiry", "galaxy-culture"]) {
    assert.ok(!catalog.entities.some((entity) => entity.id === id), "fictional demo galaxies are not retained");
  }
  const sources = resolve(process.cwd(), "../assets/data/astronomy");
  const manifest = JSON.parse(readFileSync(resolve(sources, "source-manifest.json"), "utf8")) as { rawSnapshot: string; rawSha256: string };
  const snapshot = readFileSync(resolve(sources, manifest.rawSnapshot));
  assert.equal(createHash("sha256").update(snapshot).digest("hex"), manifest.rawSha256, "the factual snapshot matches its recorded provenance");
  const rows = JSON.parse(snapshot.toString("utf8")) as { pl_name: string; hostname: string; pl_controv_flag: number }[];
  const confirmed = new Map(rows.map((row) => [row.pl_name, row]));
  for (const planet of catalog.planets) {
    assert.ok(planet.reference?.href, "every real planet retains a factual source link");
    const host = new URL(planet.reference.href).hostname;
    assert.ok(host === "nasa.gov" || host.endsWith(".nasa.gov") || host === "exoplanetarchive.ipac.caltech.edu", "only curated primary astronomy sources are bundled");
    if (planet.parentId !== "system-solar") {
      const row = confirmed.get(planet.name);
      assert.ok(row, "every exoplanet name exists in the committed primary-source snapshot");
      assert.equal(row.pl_controv_flag, 0, "controversial entries are not presented as confirmed planets");
      assert.equal(systems.find((system) => system.id === planet.parentId)?.name, row.hostname, "every planet keeps its factual host system");
    }
  }
});

test("Solar Neighborhood exposes sixteen distinct real systems with complete additional nearby host groups", () => {
  const catalog = parseUniverseCatalog(normalizeDemoCatalog(authoring));
  const nearbyNames = [
    "GJ 887", "GJ 1061", "GJ 674", "GJ 832", "GJ 682", "GJ 273", "GJ 3378", "GJ 1289",
    "HD 192310", "G 192-15", "AU Mic", "L 363-38", "GJ 341", "G 261-6", "COCONUTS-2 A",
  ];
  const nearbySystems = catalog.entities.filter((entity) => entity.kind === "system" && entity.parentId === "cloud-local-interstellar");
  assert.deepEqual(nearbySystems.map(({ name }) => name), ["Solar System", ...nearbyNames]);
  assert.equal(getSceneView(catalog, "cloud-local-interstellar").nodes.length, 16, "the first wider region must expose many selectable star systems");
  const localSystemIds = new Set(nearbySystems.map(({ id }) => id));
  assert.ok(catalog.planets.filter(({ parentId }) => localSystemIds.has(parentId!)).length > 8, "the initial region extends beyond the eight Solar System planets");

  const sources = resolve(process.cwd(), "../assets/data/astronomy");
  const manifest = JSON.parse(readFileSync(resolve(sources, "source-manifest.json"), "utf8")) as { rawSnapshot: string };
  const rows = JSON.parse(readFileSync(resolve(sources, manifest.rawSnapshot), "utf8")) as { pl_name: string; hostname: string; sy_dist: number | null }[];
  for (const hostName of nearbyNames) {
    const system = nearbySystems.find(({ name }) => name === hostName)!;
    const sourcePlanets = rows.filter(({ hostname }) => hostname === hostName);
    assert.ok(sourcePlanets.length > 0, "every added nearby system is present in the pinned primary-source snapshot");
    assert.ok(sourcePlanets.some(({ sy_dist }) => sy_dist !== null && sy_dist > 0 && sy_dist <= 15), "added nearby hosts stay within the curated 15-parsec selection");
    assert.deepEqual(
      catalog.planets.filter(({ parentId }) => parentId === system.id).map(({ name }) => name).sort(),
      sourcePlanets.map(({ pl_name }) => pl_name).sort(),
      "all eligible planets of an added host remain together in its real system",
    );
    assert.equal(catalog.entities.filter((entity) => entity.kind === "system" && entity.name === hostName).length, 1, "additional hosts never duplicate existing constellation systems");
  }
});
