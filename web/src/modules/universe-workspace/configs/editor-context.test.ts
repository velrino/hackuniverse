import assert from "node:assert/strict";
import test from "node:test";
import { parseUniverseCatalog } from "../../universe/domain";
import { getEditorParentSuggestions } from "./editor-context";

const catalog = parseUniverseCatalog({
  schemaVersion: 1, mode: "live", rootId: "u",
  entities: [
    { id: "u", kind: "universe", parentId: null, name: "Universe", description: "", seed: 0 },
    { id: "g", kind: "galaxy", parentId: "u", name: "Galaxy", description: "", seed: 1 },
    { id: "c", kind: "cloud", parentId: "g", name: "Cloud", description: "", seed: 2 },
    { id: "s1", kind: "system", parentId: "c", name: "First system", description: "", seed: 3 },
    { id: "s2", kind: "system", parentId: "c", name: "Selected system", description: "", seed: 4 },
    { id: "p", kind: "planet", parentId: "s2", name: "Selected planet", description: "", seed: 5 },
  ],
});

test("planet and system focus suggest every applicable parent from their current branch", () => {
  const expected = { planet: "s2", system: "c", cloud: "g", galaxy: "u" };
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "planet", id: "p" }), expected);
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "system", id: "s2" }), expected);
});

test("wider views do not invent a system from the first available sibling", () => {
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "cloud", id: "c" }), { system: "c", cloud: "g", galaxy: "u" });
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "galaxy", id: "g" }), { cloud: "g", galaxy: "u" });
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "universe", id: "u" }), { galaxy: "u" });
});

test("unavailable or foreign targets never leak IDs into local creation suggestions", () => {
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "planet", id: "demo-earth" }), {});
  assert.deepEqual(getEditorParentSuggestions(catalog, { kind: "planet", id: "s2" }), {});
  assert.deepEqual(getEditorParentSuggestions(undefined, { kind: "planet", id: "p" }), {});
  assert.deepEqual(getEditorParentSuggestions(catalog), {});
});
