import assert from "node:assert/strict";
import test from "node:test";
import { getBreadcrumbs, getEntity, getPlanetCount, getSceneView, getSystemStar, searchPlanets } from "./catalog";
import { parseUniverseCatalog } from "./parse-catalog";
import type { UniverseCatalogDocument } from "./types";

function document(): UniverseCatalogDocument {
  return {
    schemaVersion: 1, mode: "live", rootId: "universe:main",
    entities: [
      { id: "universe:main", kind: "universe", parentId: null, name: "Library", description: "", seed: 1 },
      { id: "galaxy:main", kind: "galaxy", parentId: "universe:main", name: "Knowledge", description: "", seed: 2 },
      { id: "cloud:main", kind: "cloud", parentId: "galaxy:main", name: "Shared work", description: "", seed: 3 },
      { id: "system:main", kind: "system", parentId: "cloud:main", name: "Workspace", description: "", seed: 4 },
      { id: "7F:Document_Alpha.v1", kind: "planet", parentId: "system:main", name: "Planning notes", description: "A readable document", seed: 5, reference: { label: "Team notebook" }, tags: ["roadmap", "shared"] },
      { id: "ticket:42", kind: "planet", parentId: "system:main", name: "Repair search", description: "", seed: 6 },
    ],
  };
}

function patchEntity(id: string, patch: object) {
  const input = document();
  return { ...input, entities: input.entities.map((entity) => entity.id === id ? { ...entity, ...patch } : entity) };
}

function assertRedactedFailure(input: unknown, marker = "SYNTHETIC_ONLY_SECRET") {
  assert.throws(() => parseUniverseCatalog(input), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.ok(!error.message.includes(marker), "validation must not echo rejected payload values");
    return true;
  });
}

test("an empty universe is valid and defaults navigation to its root", () => {
  const input = document();
  const catalog = parseUniverseCatalog({ ...input, entities: [input.entities[0]] });
  assert.deepEqual(catalog.initialTarget, { kind: "universe", id: input.rootId });
  assert.deepEqual(catalog.planets, []);
  assert.equal(getPlanetCount(catalog, input.rootId), 0);
  assert.deepEqual(getSceneView(catalog, input.rootId).nodes, []);
  assert.deepEqual(getSceneView(catalog, input.rootId).ancestors, []);
});

test("URLless documents and tickets preserve identity, order and parent-system scenes", () => {
  const input = document();
  const catalog = parseUniverseCatalog({ ...input, initialTarget: { kind: "planet", id: "7F:Document_Alpha.v1" } });
  assert.deepEqual(catalog.entities.map(({ id }) => id), input.entities.map(({ id }) => id));
  assert.deepEqual(catalog.planets.map(({ id }) => id), ["7F:Document_Alpha.v1", "ticket:42"]);
  assert.equal(catalog.planets[0], getEntity(catalog, "7F:Document_Alpha.v1"));
  assert.equal(catalog.planets[1].reference, undefined);
  assert.deepEqual(getSceneView(catalog, "7F:Document_Alpha.v1"), getSceneView(catalog, "system:main"));
  assert.equal(getSceneView(catalog, "system:main").nodes[0].subtitle, "Team notebook");
  assert.equal(getSceneView(catalog, "system:main").nodes[1].subtitle, "");
  assert.equal(getPlanetCount(catalog, input.rootId), 2);
  assert.deepEqual(getBreadcrumbs(catalog, "ticket:42").map(({ kind }) => kind), ["universe", "galaxy", "cloud", "system", "planet"]);
  assert.equal(getEntity(catalog, { kind: "galaxy", id: "ticket:42" }), undefined);
});

test("demo markers are explicit, optional and independent of catalog mode", () => {
  const input = document();
  const unmarkedDemo = parseUniverseCatalog({ ...input, mode: "demo" });
  assert.ok(unmarkedDemo.entities.every((entity) => !Object.hasOwn(entity, "type")));
  const mixed = parseUniverseCatalog({ ...input, entities: input.entities.map((entity, index) => index % 2 === 0 ? { ...entity, type: "demo", raw: "SYNTHETIC_ONLY_SECRET" } : entity) });
  assert.equal(mixed.mode, "live");
  assert.deepEqual(mixed.entities.map(({ type }) => type), ["demo", undefined, "demo", undefined, "demo", undefined]);
  assert.ok(!JSON.stringify(mixed).includes("SYNTHETIC_ONLY_SECRET"));
  const allKinds = parseUniverseCatalog({ ...input, entities: input.entities.map((entity) => ({ ...entity, type: "demo" })) });
  assert.ok(allKinds.entities.every((entity) => entity.type === "demo" && Object.isFrozen(entity)));
  assert.deepEqual(getSceneView(mixed, mixed.rootId), getSceneView(parseUniverseCatalog(input), input.rootId));
});

test("rejects unsupported entity demo markers without echoing their values", async (t) => {
  for (const type of ["SYNTHETIC_ONLY_SECRET", "live", "", null, true, 42, {}]) {
    await t.test(`unsupported ${typeof type} marker`, () => assertRedactedFailure(patchEntity("ticket:42", { type })));
  }
  for (const id of ["universe:main", "galaxy:main", "cloud:main", "system:main"]) {
    await t.test(`invalid marker on ${id}`, () => assertRedactedFailure(patchEntity(id, { type: "SYNTHETIC_ONLY_SECRET" })));
  }
});

test("search uses neutral text, tags and optional reference metadata", () => {
  const catalog = parseUniverseCatalog(patchEntity("ticket:42", { reference: { label: "Issue tracker", href: "https://tickets.example/items/42" } }));
  assert.deepEqual(searchPlanets(catalog, "ROADMAP notebook").map(({ id }) => id), ["7F:Document_Alpha.v1"]);
  assert.deepEqual(searchPlanets(catalog, "tickets.example tracker").map(({ id }) => id), ["ticket:42"]);
  assert.deepEqual(searchPlanets(catalog, "readable").map(({ id }) => id), ["7F:Document_Alpha.v1"]);
  assert.deepEqual(searchPlanets(catalog, "no-match"), []);
  assert.deepEqual(searchPlanets(catalog, "  "), catalog.planets);
});

test("branching scene projections preserve ordering, empty groups and descendant counts", () => {
  const input = document();
  const catalog = parseUniverseCatalog({ ...input, entities: [
    ...input.entities,
    { id: "system:empty", kind: "system", parentId: "cloud:main", name: "Empty", description: "", seed: 7 },
    { id: "system:second", kind: "system", parentId: "cloud:main", name: "Second", description: "", seed: 8 },
    { id: "planet:third", kind: "planet", parentId: "system:second", name: "Third", description: "", seed: 9, reference: { label: "Third reference" } },
    { id: "cloud:empty", kind: "cloud", parentId: "galaxy:main", name: "Empty cloud", description: "", seed: 10 },
  ] });
  const galaxy = getSceneView(catalog, catalog.rootId).nodes[0];
  assert.equal(galaxy.count, 3);
  assert.deepEqual(galaxy.children?.map(({ id, count }) => ({ id, count })), [
    { id: "cloud:main", count: 3 }, { id: "cloud:empty", count: 0 },
  ]);
  assert.deepEqual(galaxy.children?.[0].children?.map(({ id, count }) => ({ id, count })), [
    { id: "system:main", count: 2 }, { id: "system:empty", count: 0 }, { id: "system:second", count: 1 },
  ]);
  assert.deepEqual(getSceneView(catalog, "system:empty").nodes, []);
  assert.deepEqual(getSceneView(catalog, "planet:third"), getSceneView(catalog, "system:second"));
  assert.equal(getSceneView(catalog, "system:second").nodes[0].subtitle, "Third reference");
  for (const [id, count] of [[catalog.rootId, 3], ["cloud:main", 3], ["system:empty", 0], ["planet:third", 1]] as const) assert.equal(getPlanetCount(catalog, id), count);
  assert.equal(getPlanetCount(catalog, { kind: "galaxy", id: "planet:third" }), 0);
  assert.equal(getPlanetCount(catalog, "missing"), 0);
  assert.deepEqual(getSceneView(catalog, { kind: "galaxy", id: "planet:third" }), { key: "missing", mode: "cluster", nodes: [] });
});

test("scene anchors preserve inspected group identity and reuse their projected children", () => {
  const catalog = parseUniverseCatalog(document());
  for (const id of [catalog.rootId, "galaxy:main", "cloud:main", "system:main", "ticket:42"]) {
    const view = getSceneView(catalog, id);
    const group = getEntity(catalog, id === "ticket:42" ? "system:main" : id);
    assert.ok(group && view.anchor);
    assert.equal(view.anchor.id, group.id);
    assert.equal(view.anchor.kind, group.kind);
    assert.equal(view.anchor.seed, group.seed);
    assert.equal(view.anchor.count, 2);
    assert.equal(view.nodes, view.anchor.children, "one projection owns the child array");
  }
  const universe = getSceneView(catalog, catalog.rootId);
  const galaxy = getSceneView(catalog, "galaxy:main");
  assert.deepEqual(galaxy.anchor, universe.nodes[0], "entering a galaxy preserves its complete scene identity");
  assert.deepEqual(getSceneView(catalog, "ticket:42").anchor, getSceneView(catalog, "system:main").anchor);
  assert.equal(getSceneView(catalog, "missing").anchor, undefined);
  assert.equal(getSceneView(catalog, { kind: "galaxy", id: "ticket:42" }).anchor, undefined);
  const empty = parseUniverseCatalog({ ...document(), entities: [document().entities[0]] });
  const emptyView = getSceneView(empty, empty.rootId);
  assert.equal(emptyView.nodes, emptyView.anchor?.children);
  assert.deepEqual(emptyView.nodes, []);
});

test("scene ancestry shares one complete projected tree from root to inspected group", () => {
  const catalog = parseUniverseCatalog(document());
  const route = [catalog.rootId, "galaxy:main", "cloud:main", "system:main"];
  for (const [index, id] of [...route, "ticket:42"].entries()) {
    const view = getSceneView(catalog, id);
    assert.ok(view.anchor && view.ancestors);
    assert.deepEqual(view.ancestors.map(({ id }) => id), route.slice(0, Math.min(index, 3)));
    const chain = [...view.ancestors, view.anchor];
    for (const [position, node] of chain.entries()) {
      const entity = getEntity(catalog, node.id);
      assert.ok(entity);
      assert.equal(node.kind, entity.kind);
      assert.equal(node.seed, entity.seed);
      assert.equal(node.count, 2);
      if (position > 0) assert.equal(chain[position - 1].children?.find(({ id }) => id === node.id), node);
    }
    assert.equal(view.anchor.children, view.nodes);
    assert.deepEqual(view.ancestors[0] ?? view.anchor, getSceneView(catalog, catalog.rootId).anchor);
  }
  assert.equal(getSceneView(catalog, "missing").ancestors, undefined);
  assert.equal(getSceneView(catalog, { kind: "cloud", id: "ticket:42" }).ancestors, undefined);
  const empty = parseUniverseCatalog({ ...document(), entities: document().entities.filter(({ kind }) => kind !== "planet") });
  const system = getSceneView(empty, "system:main");
  assert.equal(system.nodes, system.anchor?.children);
  assert.deepEqual(system.nodes, []);
  assert.deepEqual(system.ancestors?.map(({ count }) => count), [0, 0, 0]);
  assert.deepEqual(getSceneView(empty, empty.rootId).ancestors, []);
});

test("scene ancestry remains local to each catalog and projection call", () => {
  const input = document();
  const first = parseUniverseCatalog(input);
  const second = parseUniverseCatalog({ ...input, entities: input.entities.filter(({ id }) => id !== "ticket:42") });
  const original = getSceneView(first, "7F:Document_Alpha.v1");
  const other = getSceneView(second, "7F:Document_Alpha.v1");
  assert.deepEqual(original.ancestors?.map(({ count }) => count), [2, 2, 2]);
  assert.deepEqual(other.ancestors?.map(({ count }) => count), [1, 1, 1]);
  assert.notEqual(original.ancestors?.[0], other.ancestors?.[0]);
  const sameCatalog = getSceneView(first, "7F:Document_Alpha.v1");
  assert.deepEqual(original, sameCatalog);
  assert.notEqual(original.ancestors?.[0], sameCatalog.ancestors?.[0]);
  original.ancestors![0].children = [];
  assert.deepEqual(getSceneView(first, "7F:Document_Alpha.v1"), sameCatalog);
});

test("projection counts and scene outputs never leak between catalogs or calls", () => {
  const input = document();
  const first = parseUniverseCatalog(input);
  const second = parseUniverseCatalog({ ...input, entities: input.entities.filter(({ id }) => id !== "ticket:42") });
  const original = getSceneView(first, first.rootId);
  assert.equal(getPlanetCount(first, first.rootId), 2);
  assert.equal(getPlanetCount(second, second.rootId), 1);
  assert.equal(getSceneView(second, second.rootId).nodes[0].count, 1);
  assert.deepEqual(getSceneView(first, first.rootId), original);
  original.nodes[0].children = [];
  assert.equal(getSceneView(first, first.rootId).nodes[0].children?.length, 1);
  assert.equal(getPlanetCount(first, first.rootId), 2);
});

test("system stars are optional metadata and never add entities or planets", () => {
  const plain = parseUniverseCatalog(document());
  assert.equal(getSystemStar(plain, "system:main"), undefined);
  assert.equal(getSceneView(plain, "system:main").starName, "Workspace");
  const catalog = parseUniverseCatalog(patchEntity("system:main", { star: { name: "Local star", description: "" } }));
  assert.deepEqual(getSystemStar(catalog, "system:main"), { name: "Local star", description: "" });
  assert.equal(getSystemStar(catalog, "galaxy:main"), undefined);
  assert.equal(getSystemStar(catalog, "ticket:42"), undefined);
  assert.equal(getSystemStar(catalog, "missing"), undefined);
  assert.equal(catalog.entities.length, plain.entities.length);
  assert.equal(getPlanetCount(catalog, catalog.rootId), 2);
  assert.equal(getSceneView(catalog, "system:main").starName, "Local star");
  assert.deepEqual(getSceneView(catalog, "system:main").nodes, getSceneView(plain, "system:main").nodes);
  assert.deepEqual(getSceneView(catalog, "ticket:42"), getSceneView(catalog, "system:main"));
});

test("star metadata and its reference are projected, owned and frozen", () => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const input = {
    name: "Sun", description: "Our local star.", spectralType: "G2 V", temperatureK: 5772,
    radiusKm: 695700, ageBillionYears: 4.6, raw: marker,
    reference: { label: "NASA", href: "https://SCIENCE.nasa.gov/sun/facts/", token: marker },
  };
  const catalog = parseUniverseCatalog(patchEntity("system:main", { star: input }));
  const star = getSystemStar(catalog, "system:main");
  assert.deepEqual(star, {
    name: "Sun", description: "Our local star.", spectralType: "G2 V", temperatureK: 5772,
    radiusKm: 695700, ageBillionYears: 4.6,
    reference: { label: "NASA", href: "https://science.nasa.gov/sun/facts/" },
  });
  assert.ok(Object.isFrozen(star) && Object.isFrozen(star?.reference));
  input.name = "Changed upstream";
  input.reference.label = "Changed reference";
  assert.equal(star?.name, "Sun");
  assert.equal(star?.reference?.label, "NASA");
  assert.ok(!JSON.stringify(catalog).includes(marker));
});

test("rejects invalid or misplaced star metadata with redacted errors", async (t) => {
  const star = { name: "Sun", description: "Our local star." };
  for (const id of ["universe:main", "galaxy:main", "cloud:main", "ticket:42"]) {
    await t.test(`metadata on ${id}`, () => assertRedactedFailure(patchEntity(id, { star })));
  }
  const invalid: [string, unknown][] = [
    ["null", null], ["array", []], ["empty name", { ...star, name: "" }],
    ["long name", { ...star, name: "x".repeat(161) }],
    ["missing description", { name: "Sun" }], ["long description", { ...star, description: "x".repeat(4001) }],
    ["empty spectral type", { ...star, spectralType: "" }], ["long spectral type", { ...star, spectralType: "x".repeat(81) }],
    ["unsafe reference", { ...star, reference: { label: "Source", href: "https://SYNTHETIC_ONLY_SECRET:password@example.invalid/" } }],
  ];
  for (const [field, maximum] of [["temperatureK", 1_000_000], ["radiusKm", 10_000_000_000], ["ageBillionYears", 100]] as const) {
    for (const value of [0, -1, NaN, Infinity, maximum + 1, "not-a-number"]) invalid.push([`${field} rejects ${String(value)}`, { ...star, [field]: value }]);
  }
  for (const [name, value] of invalid) await t.test(name, () => assertRedactedFailure(patchEntity("system:main", { star: value })));
});

test("HTTPS references normalize without prohibiting meaningful ports, queries or fragments", () => {
  const href = "https://DOCS.example:8443/notes?id=42#section";
  const input = document();
  const catalog = parseUniverseCatalog({ ...input, entities: input.entities.map((entity) => entity.kind === "planet" ? { ...entity, reference: { label: "Shared destination", href } } : entity) });
  assert.equal(catalog.planets.length, 2, "shared links do not define generic object identity");
  assert.equal(catalog.planets[0].reference?.href, "https://docs.example:8443/notes?id=42#section");
  assert.equal(catalog.planets[0].reference?.href, catalog.planets[1].reference?.href);
});

test("projection drops raw/provider fields at every owned boundary", () => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const input = patchEntity("7F:Document_Alpha.v1", {
    provider: "unused-provider", operation: "search", raw: { token: marker },
    source: { accessToken: marker }, reference: { label: "Notebook", raw: marker },
  });
  const catalog = parseUniverseCatalog({ ...input, accessToken: marker, raw: { credential: marker }, initialTarget: { kind: "planet", id: "7F:Document_Alpha.v1", token: marker } });
  const serialized = JSON.stringify(catalog);
  assert.ok(!serialized.includes(marker));
  assert.ok(!serialized.includes("unused-provider"));
  assert.equal(Object.hasOwn(catalog.planets[0], "source"), false);
  assert.equal(Object.hasOwn(catalog.planets[0], "raw"), false);
  assert.deepEqual(catalog.planets[0].reference, { label: "Notebook" });
  assert.deepEqual(catalog.initialTarget, { kind: "planet", id: "7F:Document_Alpha.v1" });
});

test("validated catalog owns frozen copies and shares its derived planet references", () => {
  const tags = ["stable"];
  const reference = { label: "Notebook" };
  const input = patchEntity("7F:Document_Alpha.v1", { tags, reference });
  const catalog = parseUniverseCatalog(input);
  reference.label = "Changed upstream";
  tags.push("later");
  assert.equal(catalog.planets[0].reference?.label, "Notebook");
  assert.deepEqual(catalog.planets[0].tags, ["stable"]);
  for (const owned of [catalog, catalog.initialTarget, catalog.entities, catalog.planets, ...catalog.entities, catalog.planets[0].reference, catalog.planets[0].tags]) {
    assert.ok(Object.isFrozen(owned));
  }
  assert.equal(catalog.planets[0], catalog.entities.find(({ id }) => id === catalog.planets[0].id));
  assert.notEqual(catalog.entities[0], input.entities[0]);
  assert.throws(() => (catalog.planets as unknown[]).push(null), TypeError);
  assert.equal(Reflect.set(catalog.planets[0], "name", "Unexpected mutation"), false);
});

test("rejects malformed hierarchy, identity and initial targets", async (t) => {
  const input = document();
  const invalid: [string, unknown][] = [
    ["unsupported schema", { ...input, schemaVersion: 2 }],
    ["unsupported mode", { ...input, mode: "preview" }],
    ["empty ID", patchEntity("ticket:42", { id: "" })],
    ["control in ID", patchEntity("ticket:42", { id: "ticket:\n42" })],
    ["unbounded ID", patchEntity("ticket:42", { id: "x".repeat(10000) })],
    ["duplicate ID", { ...input, entities: [...input.entities, input.entities[4]] }],
    ["unknown kind", patchEntity("ticket:42", { kind: "asteroid" })],
    ["missing root", { ...input, rootId: "missing" }],
    ["root of wrong kind", { ...input, rootId: "system:main" }],
    ["extra universe", { ...input, entities: [...input.entities, { ...input.entities[0], id: "universe:extra" }] }],
    ["orphan", patchEntity("ticket:42", { parentId: "missing" })],
    ["wrong parent kind", patchEntity("ticket:42", { parentId: "galaxy:main" })],
    ["non-root null parent", patchEntity("system:main", { parentId: null })],
    ["root has parent", patchEntity("universe:main", { parentId: "system:main" })],
    ["missing initial target", { ...input, initialTarget: { kind: "planet", id: "missing" } }],
    ["mismatched initial kind", { ...input, initialTarget: { kind: "galaxy", id: "ticket:42" } }],
  ];
  for (const [name, value] of invalid) await t.test(name, () => assertRedactedFailure(value));
});

test("rejects invalid seeds and bounded display fields", async (t) => {
  const invalid: [string, object][] = [
    ["negative seed", { seed: -1 }], ["fractional seed", { seed: 1.5 }],
    ["nonfinite seed", { seed: Infinity }], ["NaN seed", { seed: NaN }], ["overflow seed", { seed: 0x100000000 }],
    ["empty name", { name: "" }], ["long name", { name: "x".repeat(161) }],
    ["long description", { description: "x".repeat(4001) }],
    ["too many tags", { tags: Array.from({ length: 33 }, () => "tag") }],
    ["long tag", { tags: ["x".repeat(1001)] }], ["nontext tag", { tags: [1] }],
    ["long reference label", { reference: { label: "x".repeat(161) } }],
  ];
  for (const [name, patch] of invalid) await t.test(name, () => assertRedactedFailure(patchEntity("ticket:42", patch)));
});

test("rejects unsafe reference URLs without echoing their values", async (t) => {
  const marker = "SYNTHETIC_ONLY_SECRET";
  const invalid = [
    `javascript:alert('${marker}')`, `data:text/plain,${marker}`, `file:///${marker}`, `http://docs.example/${marker}`,
    `https://${marker}:password@docs.example/notes`, `https://docs.example/notes\n${marker}`, `not-a-url-${marker}`,
  ];
  for (const [index, href] of invalid.entries()) await t.test(`unsafe reference ${index + 1}`, () => {
    assertRedactedFailure(patchEntity("ticket:42", { reference: { label: "Source", href } }), marker);
  });
});
