import assert from "node:assert/strict";
import test from "node:test";
import { parseUniverseCatalog } from "../../universe/domain";
import {
  createWorkspaceEntity, deleteWorkspaceEntity, emptyLocalWorkspace, parseLocalWorkspace, selectWorkspaceUniverse,
  updateWorkspaceEntity, workspaceDocument, workspaceLimits, WorkspaceValidationError, type EntityDraft, type LocalWorkspace,
} from "./workspace";

const defaults = { universe: "My universe", galaxy: "My galaxy", cloud: "My cloud", system: "My system" };
const planet: EntityDraft = { kind: "planet", name: "Notes", description: "Local notes", seed: 0 };

function fixture(): LocalWorkspace {
  const catalog = parseUniverseCatalog({
    schemaVersion: 1, mode: "live", rootId: "u", initialTarget: { kind: "planet", id: "p" },
    entities: [
      { id: "u", kind: "universe", parentId: null, name: "Universe", description: "", seed: 1 },
      { id: "g", kind: "galaxy", parentId: "u", name: "Galaxy", description: "", seed: 2 },
      { id: "c", kind: "cloud", parentId: "g", name: "Cloud", description: "", seed: 3 },
      { id: "s", kind: "system", parentId: "c", name: "System", description: "", seed: 4,
        star: { name: "Star", description: "Known facts", temperatureK: 5772, reference: { label: "Facts", href: "https://facts.example/star" } } },
      { id: "p", kind: "planet", parentId: "s", name: "Planet", description: "Original", seed: 5,
        type: "demo", reference: { label: "Notebook", href: "https://notes.example/a?topic=space#intro" }, tags: ["keep"] },
      { id: "s2", kind: "system", parentId: "c", name: "Other system", description: "", seed: 6 },
      { id: "p2", kind: "planet", parentId: "s2", name: "Other planet", description: "", seed: 7 },
    ],
  });
  return parseLocalWorkspace({ schemaVersion: 1, activeUniverseId: "u", universes: [catalog] });
}

function rejects(code: string, operation: () => unknown) {
  assert.throws(operation, (error: unknown) => error instanceof WorkspaceValidationError && error.code === code);
}

test("a new workspace has zero universes and planets without copying the bundled demo", () => {
  const workspace = emptyLocalWorkspace();
  assert.deepEqual(workspace, { schemaVersion: 1, activeUniverseId: null, universes: [] });
  assert.equal(emptyLocalWorkspace(), workspace);
  assert.ok(Object.isFrozen(workspace) && Object.isFrozen(workspace.universes));
  const created = createWorkspaceEntity(workspace, { kind: "universe", name: " Mine ", description: "" }, defaults);
  assert.equal(created.workspace.universes.length, 1);
  assert.equal(created.workspace.universes[0].entities.length, 1);
  assert.equal(created.workspace.universes[0].planets.length, 0);
  assert.equal(created.workspace.universes[0].mode, "live");
  assert.equal(created.workspace.universes[0].entities[0].name, "Mine");
  assert.equal(created.workspace.universes[0].entities[0].type, undefined);
});

test("direct planet creation adds only missing empty ancestors and stable cryptographic identities", () => {
  const first = createWorkspaceEntity(emptyLocalWorkspace(), planet, defaults);
  const catalog = first.workspace.universes[0];
  assert.deepEqual(catalog.entities.map(({ kind }) => kind), ["universe", "galaxy", "cloud", "system", "planet"]);
  assert.deepEqual(catalog.entities.slice(0, 4).map(({ name }) => name), Object.values(defaults));
  assert.equal(catalog.planets[0].seed, 0);
  assert.deepEqual(catalog.initialTarget, first.target);
  for (const entity of catalog.entities) {
    assert.match(entity.id, /^(universe|galaxy|cloud|system|planet)-[0-9a-f-]{36}$/);
    assert.ok(Number.isInteger(entity.seed) && entity.seed >= 0 && entity.seed <= 0xffffffff);
  }
  const second = createWorkspaceEntity(first.workspace, { ...planet, name: "More notes" }, defaults);
  assert.equal(second.workspace.universes[0].entities.length, 6);
  assert.deepEqual(second.workspace.universes[0].entities.slice(0, 5), catalog.entities);
  assert.equal(second.workspace.universes[0].planets[1].parentId, catalog.planets[0].parentId);
  assert.notEqual(second.target.id, first.target.id);
});

test("explicit parent creation uses its universe and does not invent sibling groups", () => {
  const first = fixture();
  const other = createWorkspaceEntity(first, { kind: "universe", name: "Other", description: "" }, defaults).workspace;
  const next = createWorkspaceEntity(other, { ...planet, parentId: "s" }, defaults);
  assert.equal(next.universeId, "u");
  assert.equal(next.workspace.activeUniverseId, "u");
  assert.equal(next.workspace.universes[0].entities.length, first.universes[0].entities.length + 1);
  assert.equal(next.workspace.universes[1].entities.length, 1);
  rejects("parent", () => createWorkspaceEntity(first, { ...planet, parentId: "g" }, defaults));
  rejects("not-found", () => createWorkspaceEntity(first, { ...planet, parentId: "missing" }, defaults));
  rejects("parent", () => createWorkspaceEntity(first, { kind: "universe", parentId: "u", name: "Bad", description: "" }, defaults));
});

test("updates preserve identity, seed, order, classification, tags and star metadata", () => {
  const original = fixture();
  const changed = updateWorkspaceEntity(original, "p", { ...planet, seed: 999, name: "Renamed", description: "Updated" });
  const before = original.universes[0].planets[0];
  const after = changed.universes[0].planets[0];
  assert.deepEqual(after, { ...before, name: "Renamed", description: "Updated" });
  assert.deepEqual(changed.universes[0].entities.map(({ id }) => id), original.universes[0].entities.map(({ id }) => id));
  const star = updateWorkspaceEntity(changed, "s", { kind: "system", name: "Renamed system", description: "New copy", seed: 42 });
  assert.deepEqual(star.universes[0].entities.find(({ id }) => id === "s")?.kind, "system");
  const updatedSystem = star.universes[0].entities.find(({ id }) => id === "s");
  assert.ok(updatedSystem?.kind === "system");
  const originalSystem = original.universes[0].entities.find(({ id }) => id === "s");
  assert.ok(originalSystem?.kind === "system");
  assert.deepEqual(updatedSystem.star, originalSystem.star);
});

test("planet URL edits normalize HTTPS, preserve reference labels and remove only href", () => {
  const workspace = fixture();
  const updated = updateWorkspaceEntity(workspace, "p", { ...planet, href: "https://DOCS.example:8443/a?topic=space#intro" });
  assert.deepEqual(updated.universes[0].planets[0].reference, { label: "Notebook", href: "https://docs.example:8443/a?topic=space#intro" });
  const removed = updateWorkspaceEntity(updated, "p", { ...planet, href: "" });
  assert.deepEqual(removed.universes[0].planets[0].reference, { label: "Notebook" });
  assert.deepEqual(removed.universes[0].planets[0].tags, ["keep"]);
  for (const href of ["http://docs.example", "javascript:alert(1)", "https://synthetic:password@docs.example/", "https://docs.example/a\nprivate", "not a URL"]) {
    rejects("invalid", () => createWorkspaceEntity(workspace, { ...planet, href }, defaults));
  }
  rejects("invalid", () => createWorkspaceEntity(workspace, { kind: "galaxy", name: "Group", description: "", href: "https://docs.example" }, defaults));
});

test("reparenting is restricted to the right parent kind in the same universe", () => {
  const workspace = fixture();
  const moved = updateWorkspaceEntity(workspace, "p", { ...planet, parentId: "s2" });
  assert.equal(moved.universes[0].planets[0].parentId, "s2");
  assert.equal(moved.universes[0].planets[0].seed, 5);
  rejects("parent", () => updateWorkspaceEntity(workspace, "p", { ...planet, parentId: "g" }));
  rejects("invalid", () => updateWorkspaceEntity(workspace, "p", { kind: "system", name: "Bad", description: "" }));
  const second = createWorkspaceEntity(workspace, { kind: "planet", name: "Elsewhere", description: "", parentId: "s" }, defaults);
  const separate = createWorkspaceEntity(second.workspace, { kind: "universe", name: "Second", description: "" }, defaults);
  const newBranch = createWorkspaceEntity(separate.workspace, planet, defaults);
  const outsideParent = newBranch.workspace.universes[1].planets[0].parentId;
  rejects("parent", () => updateWorkspaceEntity(newBranch.workspace, "p", { ...planet, parentId: outsideParent }));
});

test("deletion cascades descendants in arbitrary source order and repairs initial navigation", () => {
  const original = fixture();
  const reversed = parseLocalWorkspace({ ...original, universes: [{ ...original.universes[0], entities: [...original.universes[0].entities].reverse() }] });
  const branchDeleted = deleteWorkspaceEntity(reversed, "s").universes[0];
  assert.deepEqual(branchDeleted.entities.map(({ id }) => id), ["p2", "s2", "c", "g", "u"]);
  assert.deepEqual(branchDeleted.initialTarget, { kind: "cloud", id: "c" });
  assert.equal(branchDeleted.planets.length, 1);
  const galaxyDeleted = deleteWorkspaceEntity(reversed, "g").universes[0];
  assert.deepEqual(galaxyDeleted.entities.map(({ id }) => id), ["u"]);
  assert.deepEqual(galaxyDeleted.initialTarget, { kind: "universe", id: "u" });
  assert.equal(original.universes[0].planets.length, 2, "source workspace is immutable");
});

test("universe selection and deletion resolve the active universe without extra content", () => {
  const first = fixture();
  const second = createWorkspaceEntity(first, { kind: "universe", name: "Second", description: "" }, defaults);
  assert.equal(second.workspace.activeUniverseId, second.universeId);
  assert.equal(selectWorkspaceUniverse(second.workspace, "u").activeUniverseId, "u");
  const updateInactive = updateWorkspaceEntity(second.workspace, "p", planet);
  assert.equal(updateInactive.activeUniverseId, second.universeId);
  const deletingInactive = deleteWorkspaceEntity(second.workspace, "p");
  assert.equal(deletingInactive.activeUniverseId, second.universeId);
  const deletingActive = deleteWorkspaceEntity(second.workspace, second.universeId);
  assert.equal(deletingActive.activeUniverseId, "u");
  assert.deepEqual(deleteWorkspaceEntity(deletingActive, "u"), emptyLocalWorkspace());
  rejects("not-found", () => selectWorkspaceUniverse(first, "missing"));
});

test("the workspace parser validates catalogs, global identities, active selection and quotas", () => {
  const workspace = fixture();
  assert.ok(Object.isFrozen(parseLocalWorkspace(workspace).universes[0].entities));
  assert.ok(!("planets" in workspaceDocument(workspace).universes[0]));
  for (const input of [null, [], { ...workspace, schemaVersion: 2 }, { ...workspace, activeUniverseId: null }, { ...workspace, activeUniverseId: "missing" }, { ...workspace, universes: [workspace.universes[0], workspace.universes[0]] }, { ...workspace, universes: [{ ...workspace.universes[0], entities: [] }] }]) {
    rejects("invalid", () => parseLocalWorkspace(input));
  }
  rejects("limit", () => parseLocalWorkspace({ ...workspace, universes: Array.from({ length: workspaceLimits.universes + 1 }, () => workspace.universes[0]) }));
  rejects("limit", () => parseLocalWorkspace({ ...workspace, universes: [{ ...workspace.universes[0], entities: Array.from({ length: workspaceLimits.entities + 1 }, () => workspace.universes[0].entities[0]) }] }));
  for (const seed of [-1, 0x100000000, 1.5, NaN]) rejects("invalid", () => createWorkspaceEntity(workspace, { ...planet, seed }, defaults));
});
