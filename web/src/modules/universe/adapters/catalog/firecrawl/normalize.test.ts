import assert from "node:assert/strict";
import test from "node:test";
import { getSceneView, searchPlanets } from "../../../domain/catalog";
import { parseUniverseCatalog } from "../../../domain/parse-catalog";
import type { UniverseCatalogDocument, UniverseGroup } from "../../../domain/types";
import { normalizeFirecrawlSearch, type FirecrawlSearchInput } from "./index";

const groups: readonly UniverseGroup[] = [
  { id: "universe:main", kind: "universe", parentId: null, name: "Library", description: "", seed: 1 },
  { id: "galaxy:main", kind: "galaxy", parentId: "universe:main", name: "Knowledge", description: "", seed: 2 },
  { id: "cloud:main", kind: "cloud", parentId: "galaxy:main", name: "Shared work", description: "", seed: 3 },
  { id: "system:main", kind: "system", parentId: "cloud:main", name: "Workspace", description: "", seed: 4 },
];

function response() {
  return { success: true, data: { web: [
    { url: "https://DOCS.example:443/alpha", title: "Alpha notes", description: "Readable source" },
    { url: "https://docs.example/beta?topic=planning#details", title: "Beta notes", description: "" },
  ] } };
}

function input(providerResponse: unknown = response()): FirecrawlSearchInput {
  return {
    mode: "demo", rootId: "universe:main", initialTarget: { kind: "system", id: "system:main" }, groups,
    batches: [{
      id: "batch-one", systemId: "system:main", query: "planning resources", response: providerResponse,
      // Application order is deliberately independent of provider ranking.
      mapping: [{ planetId: "planet:beta", seed: 21, position: 2 }, { planetId: "planet:alpha", seed: 20, position: 1 }],
    }],
  };
}

function assertRedactedFailure(value: FirecrawlSearchInput, marker = "SYNTHETIC_ONLY_SECRET") {
  assert.throws(() => normalizeFirecrawlSearch(value), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(marker), "adapter validation must not echo provider values");
    return true;
  });
}

test("maps explicit application identity independently of provider order", () => {
  const normalized = normalizeFirecrawlSearch(input());
  const catalog = parseUniverseCatalog(normalized);
  assert.deepEqual(catalog.planets.map(({ id, seed }) => ({ id, seed })), [{ id: "planet:beta", seed: 21 }, { id: "planet:alpha", seed: 20 }]);
  assert.equal(catalog.planets[0].parentId, "system:main");
  assert.deepEqual(catalog.planets[0].reference, { label: "docs.example", href: "https://docs.example/beta?topic=planning#details" });
  assert.equal(catalog.planets[1].reference?.href, "https://docs.example/alpha");
  assert.equal(catalog.planets[0].description, "");
  assert.deepEqual(catalog.planets[0].tags, ["planning resources"]);
  assert.equal(normalized.schemaVersion, 1);
  assert.equal(normalized.mode, "demo");
});

test("accepts optional matching provider positions and empty result batches", () => {
  const supplied = response();
  const ranked = { ...supplied, data: { web: supplied.data.web.map((result, index) => ({ ...result, position: index + 1 })) } };
  assert.equal(parseUniverseCatalog(normalizeFirecrawlSearch(input(ranked))).planets.length, 2);
  const empty = input({ success: true, data: { web: [] } });
  const normalized = normalizeFirecrawlSearch({ ...empty, batches: [{ ...empty.batches[0], mapping: [] }] });
  assert.deepEqual(parseUniverseCatalog(normalized).planets, []);
});

test("preserves multiline source descriptions as plain catalog text", () => {
  const supplied = response();
  supplied.data.web[0].description = "First paragraph.\nSecond paragraph.";
  const catalog = parseUniverseCatalog(normalizeFirecrawlSearch(input(supplied)));
  assert.equal(catalog.planets.find(({ id }) => id === "planet:alpha")?.description, supplied.data.web[0].description);
});

test("projects provider tokens/raw fields instead of forwarding them to the catalog", () => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const supplied = response();
  const raw = { ...supplied, token: marker, data: { web: supplied.data.web.map((result) => ({ ...result, raw: { authorization: marker }, provider: "firecrawl", metadata: { token: marker } })) } };
  const value = input(raw);
  const normalized = normalizeFirecrawlSearch({ ...value, groups: value.groups.map((group) => ({ ...group, credentials: marker })) });
  const catalog = parseUniverseCatalog(normalized);
  assert.ok(!JSON.stringify(normalized).includes(marker));
  assert.ok(!JSON.stringify(catalog).includes(marker));
  for (const planet of catalog.planets) {
    assert.equal(Object.hasOwn(planet, "provider"), false);
    assert.equal(Object.hasOwn(planet, "source"), false);
    assert.equal(Object.hasOwn(planet, "position"), false);
  }
});

test("provider-shaped and directly supplied neutral records produce the same catalog", () => {
  const direct: UniverseCatalogDocument = {
    schemaVersion: 1, mode: "demo", rootId: "universe:main", initialTarget: { kind: "system", id: "system:main" },
    entities: [
      ...groups,
      { id: "planet:beta", kind: "planet", parentId: "system:main", name: "Beta notes", description: "", seed: 21, reference: { label: "docs.example", href: "https://docs.example/beta?topic=planning#details" }, tags: ["planning resources"] },
      { id: "planet:alpha", kind: "planet", parentId: "system:main", name: "Alpha notes", description: "Readable source", seed: 20, reference: { label: "docs.example", href: "https://docs.example/alpha" }, tags: ["planning resources"] },
    ],
  };
  const adapted = parseUniverseCatalog(normalizeFirecrawlSearch(input()));
  const canonical = parseUniverseCatalog(direct);
  assert.deepEqual(adapted, canonical);
  assert.deepEqual(getSceneView(adapted, "system:main"), getSceneView(canonical, "planet:alpha"));
  const ticket = parseUniverseCatalog({ ...direct, entities: [...groups, { id: "ticket:42", kind: "planet", parentId: "system:main", name: "Planning ticket", description: "No public URL", seed: 20, tags: ["planning resources"] }] });
  assert.equal(searchPlanets(ticket, "planning")[0].id, "ticket:42");
  assert.equal(getSceneView(ticket, "ticket:42").mode, "system");
});

test("rejects malformed provider success, envelopes and result fields", async (t) => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const malformed: [string, unknown][] = [
    ["null response", null], ["failed response", { success: false, error: marker }],
    ["missing data", { success: true, token: marker }],
    ["non-array web", { success: true, data: { web: marker } }],
    ["non-object result", { success: true, data: { web: [marker, response().data.web[1]] } }],
    ["missing title", { success: true, data: { web: [{ url: "https://docs.example/alpha", description: "Description" }, response().data.web[1]] } }],
    ["missing description", { success: true, data: { web: [{ url: "https://docs.example/alpha", title: "Title" }, response().data.web[1]] } }],
    ["wrong provider position", { success: true, data: { web: [{ ...response().data.web[0], position: 2 }, response().data.web[1]] } }],
  ];
  for (const [name, providerResponse] of malformed) await t.test(name, () => assertRedactedFailure(input(providerResponse), marker));
});

test("rejects incomplete, repeated or invalid identity mappings", async (t) => {
  const value = input();
  const batch = value.batches[0];
  const malformed: [string, FirecrawlSearchInput][] = [
    ["missing result mapping", { ...value, batches: [{ ...batch, mapping: batch.mapping.slice(0, 1) }] }],
    ["duplicate position", { ...value, batches: [{ ...batch, mapping: batch.mapping.map((entry) => ({ ...entry, position: 1 })) }] }],
    ["zero position", { ...value, batches: [{ ...batch, mapping: [{ ...batch.mapping[0], position: 0 }, batch.mapping[1]] }] }],
    ["out-of-range position", { ...value, batches: [{ ...batch, mapping: [{ ...batch.mapping[0], position: 3 }, batch.mapping[1]] }] }],
    ["fractional position", { ...value, batches: [{ ...batch, mapping: [{ ...batch.mapping[0], position: 1.5 }, batch.mapping[1]] }] }],
    ["duplicate planet ID", { ...value, batches: [{ ...batch, mapping: batch.mapping.map((entry) => ({ ...entry, planetId: "planet:same" })) }] }],
    ["group/planet ID collision", { ...value, batches: [{ ...batch, mapping: [{ ...batch.mapping[0], planetId: "system:main" }, batch.mapping[1]] }] }],
    ["invalid seed", { ...value, batches: [{ ...batch, mapping: [{ ...batch.mapping[0], seed: -1 }, batch.mapping[1]] }] }],
    ["duplicate batch ID", { ...value, batches: [batch, batch] }],
    ["unknown destination", { ...value, batches: [{ ...batch, systemId: "missing" }] }],
  ];
  for (const [name, malformedInput] of malformed) await t.test(name, () => assertRedactedFailure(malformedInput));
});

test("website URL identity is deduplicated by this adapter, including across batches", () => {
  const duplicate = response();
  duplicate.data.web[1].url = "https://docs.example/alpha";
  assertRedactedFailure(input(duplicate));
  const value = input();
  const second = { ...value.batches[0], id: "batch-two", mapping: value.batches[0].mapping.map((entry) => ({ ...entry, planetId: `${entry.planetId}-copy` })) };
  assertRedactedFailure({ ...value, batches: [...value.batches, second] });
});

test("rejects recognizable credentials and unsafe result URLs with redacted errors", async (t) => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const urls = [
    `javascript:${marker}`, `http://docs.example/${marker}`, `https://${marker}:password@docs.example/alpha`,
    `https://docs.example/alpha\n${marker}`, `https://docs.example/alpha?access_token=${marker}`,
    `https://docs.example/alpha?X-Amz-Signature=${marker}`, `https://docs.example/alpha#token=${marker}`,
  ];
  for (const [index, url] of urls.entries()) await t.test(`unsafe URL ${index + 1}`, () => {
    const supplied = response();
    supplied.data.web[0].url = url;
    assertRedactedFailure(input(supplied), marker);
  });
});
