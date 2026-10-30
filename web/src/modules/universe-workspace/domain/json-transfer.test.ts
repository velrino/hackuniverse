import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceEntity, emptyLocalWorkspace, parseLocalWorkspace, workspaceDocument, workspaceLimits } from "./workspace";
import { assertTransferJsonStructure, exportWorkspaceJson, jsonTransferLimits, parseTransferJson, parseWorkspaceJson, prepareWorkspaceImport, TransferValidationError, validateWorkspaceJson, type TransferValidationCode } from "./json-transfer";

function document(prefix = "a", planets = 1, description = "Illustrative notes") {
  return {
    schemaVersion: 1, activeUniverseId: `${prefix}-u`, universes: [{
      schemaVersion: 1, mode: "live", rootId: `${prefix}-u`, initialTarget: { kind: "universe", id: `${prefix}-u` },
      entities: [
        { id: `${prefix}-u`, kind: "universe", parentId: null, name: "Universe", description: "", seed: 0 },
        { id: `${prefix}-g`, kind: "galaxy", parentId: `${prefix}-u`, name: "Galaxy", description: "", seed: 1 },
        { id: `${prefix}-c`, kind: "cloud", parentId: `${prefix}-g`, name: "Cloud", description: "", seed: 2 },
        { id: `${prefix}-s`, kind: "system", parentId: `${prefix}-c`, name: "System", description: "", seed: 3 },
        ...Array.from({ length: planets }, (_, index) => ({ id: `${prefix}-p${index}`, kind: "planet", parentId: `${prefix}-s`, name: `Planet ${index}`, description, seed: 0xffffffff - index })),
      ],
    }],
  };
}

function rejects(code: TransferValidationCode, operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof TransferValidationError && error.code === code);
}

test("canonical exports round-trip all workspace data, identities, seeds and source ordering", () => {
  const source = document();
  const entities = source.universes[0].entities;
  Object.assign(entities[3], { star: { name: "Sun", description: "A local star", spectralType: "G2V", temperatureK: 5772, reference: { label: "Facts", href: "https://facts.example/star" } } });
  Object.assign(entities[4], { type: "demo", tags: ["notes"], reference: { label: "Notes", href: "https://notes.example/path?topic=space#intro" } });
  entities.reverse();
  const workspace = parseLocalWorkspace(source);
  const before = JSON.stringify(workspace);
  const exported = exportWorkspaceJson(workspace);
  assert.ok(exported.includes("\n"));
  assert.equal(Object.hasOwn(JSON.parse(exported).universes[0], "planets"), false);
  const imported = parseWorkspaceJson(exported);
  assert.deepEqual(imported, workspace);
  assert.ok(Object.isFrozen(imported) && Object.isFrozen(imported.universes[0].entities));
  assert.equal(JSON.stringify(workspace), before);
  assert.deepEqual(parseWorkspaceJson(exportWorkspaceJson(emptyLocalWorkspace())), emptyLocalWorkspace());
});

test("validation owns a snapshot and does not mutate the JSON editor's object", () => {
  const value = document();
  const before = JSON.stringify(value);
  const workspace = validateWorkspaceJson(value);
  assert.equal(JSON.stringify(value), before);
  value.universes[0].entities[0].name = "Later editor change";
  assert.equal(workspace.universes[0].entities[0].name, "Universe");
});

test("the editor's structural gate accepts safe unfinished drafts and every JSON fragment type", () => {
  const draft = { schemaVersion: 1, activeUniverseId: "unfinished", universes: [] };
  assert.doesNotThrow(() => assertTransferJsonStructure(draft));
  assert.deepEqual(parseTransferJson(JSON.stringify(draft)), draft);
  rejects("shape", () => validateWorkspaceJson(draft));
  for (const value of [null, true, 42, "illustrative text", [1, false, null]]) assert.deepEqual(parseTransferJson(JSON.stringify(value)), value);
  rejects("unsafe", () => parseTransferJson('{"constructor":{}}'));
  assert.doesNotThrow(() => parseTransferJson("[".repeat(16) + "0" + "]".repeat(16)));
  rejects("depth", () => parseTransferJson("[".repeat(17) + "0" + "]".repeat(17)));
  rejects("size", () => assertTransferJsonStructure("x".repeat(workspaceLimits.bytes)));
});

test("imports accept only canonical workspace documents and reject unknown fields", () => {
  const value = document();
  for (const input of [null, [], value.universes[0], { success: true, data: [] }, { ...value, schemaVersion: 2 }, { ...value, extra: "supplier metadata" }, { ...value, activeUniverseId: "missing" }]) rejects("shape", () => validateWorkspaceJson(input));
  const withDerivedIndex = { ...value, universes: [{ ...value.universes[0], planets: [] }] };
  rejects("shape", () => validateWorkspaceJson(withDerivedIndex));
  const unknownEntity = document();
  Object.assign(unknownEntity.universes[0].entities[4], { rawHtml: "Synthetic content" });
  rejects("shape", () => validateWorkspaceJson(unknownEntity));
});

test("canonical parent, duplicate identity, field bounds and HTTPS rules remain authoritative", () => {
  for (const href of ["javascript:alert(1)", "http://example.test", "https://synthetic:password@example.test", "https://example.test/\nprivate"]) {
    const value = document();
    Object.assign(value.universes[0].entities[4], { reference: { label: "Website", href } });
    rejects("shape", () => validateWorkspaceJson(value));
  }
  const badParent = document();
  badParent.universes[0].entities[4].parentId = "a-g";
  rejects("shape", () => validateWorkspaceJson(badParent));
  const duplicate = document();
  duplicate.universes[0].entities[4].id = "a-u";
  rejects("shape", () => validateWorkspaceJson(duplicate));
  for (const [key, value] of [["name", "n".repeat(161)], ["description", "d".repeat(4001)], ["seed", -1], ["seed", 0x100000000]]) {
    const input = document();
    Object.assign(input.universes[0].entities[4], { [key]: value });
    rejects("shape", () => validateWorkspaceJson(input));
  }
});

test("URLs created from short Unicode input retain their longer normalized href across transfer", () => {
  const href = `https://example.test/${"界".repeat(600)}`;
  assert.ok(href.length < 4096);
  const { workspace } = createWorkspaceEntity(emptyLocalWorkspace(), {
    kind: "planet", name: "Unicode website", description: "", seed: 42, href,
  }, { universe: "Universe", galaxy: "Galaxy", cloud: "Cloud", system: "System" });
  const normalized = workspace.universes[0].planets[0].reference?.href;
  assert.equal(normalized, new URL(href).href);
  assert.ok(normalized.length > 4096);
  const imported = parseWorkspaceJson(exportWorkspaceJson(workspace));
  assert.equal(imported.universes[0].planets[0].reference?.href, normalized);
  assert.deepEqual(imported, workspace);
});

test("raw byte and depth checks run before JSON.parse, including UTF-8 and bracket characters in strings", (t) => {
  const original = JSON.parse;
  let calls = 0;
  t.mock.method(JSON, "parse", (...args: Parameters<typeof JSON.parse>) => { calls++; return original(...args); });
  rejects("size", () => parseWorkspaceJson(" ".repeat(workspaceLimits.bytes + 1)));
  const multibyte = `"${"😀".repeat(530_000)}"`;
  assert.ok(multibyte.length < workspaceLimits.bytes);
  rejects("size", () => parseWorkspaceJson(multibyte));
  rejects("depth", () => parseWorkspaceJson("[".repeat(jsonTransferLimits.depth + 1) + "0" + "]".repeat(jsonTransferLimits.depth + 1)));
  assert.equal(calls, 0);
  const value = document("brackets", 1, 'Literal [{ ]} brackets, an escaped quote " and backslash \\ remain plain text.');
  assert.deepEqual(parseWorkspaceJson(JSON.stringify(value)), parseLocalWorkspace(value));
  for (const text of ["{broken", "{\"schemaVersion\":1,}", "", "]"]) rejects("syntax", () => parseWorkspaceJson(text));
});

test("object imports reject deep, cyclic, non-JSON and prototype-sensitive values without invoking accessors", () => {
  let nested: unknown = null;
  for (let level = 0; level <= jsonTransferLimits.depth; level++) nested = [nested];
  rejects("depth", () => validateWorkspaceJson(nested));
  const cycle: unknown[] = [];
  cycle.push(cycle);
  rejects("unsafe", () => validateWorkspaceJson(cycle));
  for (const value of [new Date(), new Map(), Object.create({ inherited: true }), undefined, BigInt(1), NaN, Infinity, () => {}]) rejects("unsafe", () => validateWorkspaceJson(value));
  let getterCalls = 0;
  const accessor = { get universes() { getterCalls++; return []; } };
  rejects("unsafe", () => validateWorkspaceJson(accessor));
  assert.equal(getterCalls, 0);
  const coercion = { toJSON() { throw new Error("Must not execute user methods"); } };
  rejects("unsafe", () => validateWorkspaceJson(coercion));
  for (const key of ["__proto__", "constructor", "prototype"]) {
    rejects("unsafe", () => parseWorkspaceJson(`{"${key}":{},"schemaVersion":1,"activeUniverseId":null,"universes":[]}`));
    const value = document();
    Object.defineProperty(value.universes[0].entities[4], key, { value: {}, enumerable: true });
    rejects("unsafe", () => validateWorkspaceJson(value));
  }
  const symbol = { [Symbol("private")]: "not JSON" };
  rejects("unsafe", () => validateWorkspaceJson(symbol));
  rejects("unsafe", () => validateWorkspaceJson(Array(3)));
  assert.equal(Object.hasOwn(Object.prototype, "polluted"), false);
});

test("the node budget is enforced without treating ordinary shared object references as cycles", () => {
  assert.doesNotThrow(() => assertTransferJsonStructure(Array.from({ length: jsonTransferLimits.nodes - 1 }, () => null)));
  rejects("limit", () => validateWorkspaceJson(Array.from({ length: jsonTransferLimits.nodes }, () => null)));
  const shared = { label: "Shared reference", href: "https://example.test/" };
  const value = document("shared", 2);
  for (const entity of value.universes[0].entities.slice(4)) Object.assign(entity, { reference: shared });
  assert.equal(validateWorkspaceJson(value).universes[0].planets.length, 2);
});

test("merge preserves both inputs, current selection and order, and rejects every existing ID collision", () => {
  const current = validateWorkspaceJson(document("current"));
  const incoming = validateWorkspaceJson(document("incoming"));
  const merged = prepareWorkspaceImport(current, incoming);
  assert.equal(merged.activeUniverseId, current.activeUniverseId);
  assert.deepEqual(merged.universes, [...current.universes, ...incoming.universes]);
  assert.equal(current.universes.length, 1);
  assert.equal(incoming.universes.length, 1);
  rejects("conflict", () => prepareWorkspaceImport(current, current));
  const conflicting = document("other");
  conflicting.universes[0].entities[4].id = "current-p0";
  rejects("conflict", () => prepareWorkspaceImport(current, validateWorkspaceJson(conflicting)));
  assert.deepEqual(prepareWorkspaceImport(emptyLocalWorkspace(), incoming), incoming);
  assert.deepEqual(prepareWorkspaceImport(current, incoming, "replace"), incoming);
  assert.deepEqual(prepareWorkspaceImport(current, emptyLocalWorkspace(), "replace"), emptyLocalWorkspace());
});

test("universe, entity and UTF-8 byte caps apply to the combined merge", () => {
  const many = Array.from({ length: workspaceLimits.universes }, (_, index) => document(`u${index}`, 0).universes[0]);
  const full = validateWorkspaceJson({ schemaVersion: 1, activeUniverseId: many[0].rootId, universes: many });
  rejects("limit", () => prepareWorkspaceImport(full, validateWorkspaceJson(document("overflow", 0))));
  const first = validateWorkspaceJson(document("first", 1000));
  const second = validateWorkspaceJson(document("second", 1000));
  rejects("limit", () => prepareWorkspaceImport(first, second));
  const heavyA = validateWorkspaceJson(document("heavy-a", 300, "😀".repeat(900)));
  const heavyB = validateWorkspaceJson(document("heavy-b", 300, "😀".repeat(900)));
  rejects("size", () => prepareWorkspaceImport(heavyA, heavyB));
});

test("exports fall back to compact JSON when indentation alone would exceed the import cap", () => {
  const value = document("nearly-full", 520, "d".repeat(3800));
  let workspace = validateWorkspaceJson(value);
  const compact = JSON.stringify(workspaceDocument(workspace));
  let remaining = workspaceLimits.bytes - new TextEncoder().encode(compact).length - 32;
  // Fill legal description fields until compact storage fits but indentation does not.
  for (const entity of value.universes[0].entities) {
    if (remaining <= 0) break;
    const addition = Math.min(4000 - entity.description.length, remaining);
    entity.description += "d".repeat(Math.max(0, addition));
    remaining -= addition;
  }
  workspace = validateWorkspaceJson(value);
  assert.ok(new TextEncoder().encode(JSON.stringify(workspaceDocument(workspace), null, 2)).length > workspaceLimits.bytes);
  const output = exportWorkspaceJson(workspace);
  assert.ok(new TextEncoder().encode(output).length <= workspaceLimits.bytes);
  assert.equal(output, JSON.stringify(workspaceDocument(workspace)));
  assert.deepEqual(parseWorkspaceJson(output), workspace);
});
