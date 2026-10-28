import assert from "node:assert/strict";
import test from "node:test";
import { parseUniverseCatalog } from "../domain/parse-catalog";
import type { NavigationTarget, UniverseCatalog, UniverseCatalogDocument } from "../domain/types";
import { buildManualUniverseTour } from "./universe-tour-route";
import type { UniverseTourStep } from "./use-universe-tour";

function fixture(): UniverseCatalog {
  const rows: [string, NavigationTarget["kind"], string | null][] = [
    ["root", "universe", null], ["galaxy-a", "galaxy", "root"], ["galaxy-b", "galaxy", "root"],
    ["cloud-a", "cloud", "galaxy-a"], ["cloud-b", "cloud", "galaxy-b"],
    ["system-a", "system", "cloud-a"], ["system-a2", "system", "cloud-a"], ["system-b", "system", "cloud-b"],
    ["planet-a", "planet", "system-a"], ["planet-a-sibling", "planet", "system-a"],
    ["planet-a2", "planet", "system-a2"], ["planet-b", "planet", "system-b"],
  ];
  return parseUniverseCatalog({ schemaVersion: 1, mode: "live", rootId: "root", entities: rows.map(([id, kind, parentId], seed) => ({ id, kind, parentId, seed, name: id, description: "" })) });
}
const target = (kind: NavigationTarget["kind"], id: string): NavigationTarget => ({ kind, id });
const steps: readonly UniverseTourStep[] = [
  { target: target("planet", "planet-b"), holdMs: 3000 },
  { target: target("system", "system-b"), holdMs: 0 },
  { target: target("universe", "root"), holdMs: 2200 },
];
const ids = (route: readonly UniverseTourStep[] | null) => route?.map(({ target }) => target.id);

test("manual tour crosses galaxies through adjacent parents and descendants", () => {
  const route = buildManualUniverseTour(fixture(), target("planet", "planet-a"), steps);
  assert.ok(route);
  assert.deepEqual(ids(route), ["cloud-a", "galaxy-a", "root", "galaxy-b", "cloud-b", "system-b", "planet-b", "system-b", "root"]);
  assert.ok(route.slice(0, 6).every((step) => step.motion === "approach" && step.holdMs === 0));
  assert.deepEqual(route[6], { target: steps[0].target, holdMs: 1000, motion: "approach" });
  assert.deepEqual(route.slice(7), steps.slice(1));
});

test("manual tour uses the common cloud for another system", () => {
  const route = buildManualUniverseTour(fixture(), target("system", "system-a"), [{ target: target("planet", "planet-a2") }]);
  assert.deepEqual(ids(route), ["cloud-a", "system-a2", "planet-a2"]);
});

test("same-group planets and the configured first planet need no wider detour", () => {
  for (const current of [target("planet", "planet-a"), target("planet", "planet-a-sibling"), target("system", "system-a")]) {
    const route = buildManualUniverseTour(fixture(), current, [{ target: target("planet", "planet-a"), holdMs: 3000 }]);
    assert.deepEqual(route, [{ target: target("planet", "planet-a"), holdMs: 1000, motion: "approach" }]);
  }
});

test("root-to-planet approach descends each group without repeating the root", () => {
  const route = buildManualUniverseTour(fixture(), target("universe", "root"), [steps[0]]);
  assert.deepEqual(ids(route), ["galaxy-b", "cloud-b", "system-b", "planet-b"]);
});

test("a group destination replaces its transit step with the one-second arrival hold", () => {
  for (const [current, destination, expected] of [
    [target("planet", "planet-a"), target("cloud", "cloud-a"), ["cloud-a"]],
    [target("universe", "root"), target("galaxy", "galaxy-b"), ["galaxy-b"]],
    [target("system", "system-a"), target("system", "system-a"), ["system-a"]],
  ] as const) {
    const route = buildManualUniverseTour(fixture(), current, [{ target: destination }]);
    assert.deepEqual(ids(route), expected);
    assert.equal(route?.at(-1)?.holdMs, 1000);
  }
});

test("invalid current, first or later targets and empty definitions produce no route", () => {
  const catalog = fixture();
  for (const invalid of [target("planet", "missing"), target("galaxy", "planet-a")]) {
    assert.equal(buildManualUniverseTour(catalog, invalid, steps), null);
    assert.equal(buildManualUniverseTour(catalog, target("planet", "planet-a"), [{ target: invalid }]), null);
    assert.equal(buildManualUniverseTour(catalog, target("planet", "planet-a"), [...steps, { target: invalid }]), null);
  }
  assert.equal(buildManualUniverseTour(catalog, target("planet", "planet-a"), []), null);
});

test("targets outside the catalog root cannot be joined into the tour", () => {
  const catalog = fixture();
  const extra: UniverseCatalogDocument["entities"] = [
    { id: "other-root", kind: "universe", parentId: null, name: "Other", description: "", seed: 200 },
    { id: "other-galaxy", kind: "galaxy", parentId: "other-root", name: "Other", description: "", seed: 201 },
  ];
  const separate = { ...catalog, entities: [...catalog.entities, ...extra] };
  assert.equal(buildManualUniverseTour(separate, target("galaxy", "other-galaxy"), steps), null);
  assert.equal(buildManualUniverseTour(separate, target("universe", "root"), [{ target: target("galaxy", "other-galaxy") }]), null);
});

test("manual route snapshots leave the original three-second automatic start and tail unchanged", () => {
  const configured = [{ target: { kind: "planet" as const, id: "planet-b" }, holdMs: 3000 }, { target: { kind: "universe" as const, id: "root" }, holdMs: 2200 }];
  const route = buildManualUniverseTour(fixture(), target("system", "system-b"), configured);
  assert.ok(route);
  assert.equal(configured[0].holdMs, 3000);
  assert.equal(route[0].holdMs, 1000);
  assert.notEqual(route[1], configured[1]);
  assert.notEqual(route[1].target, configured[1].target);
  assert.equal(Object.hasOwn(route[1], "motion"), false);
  configured[1].holdMs = 9000;
  configured[1].target.id = "changed-upstream";
  assert.equal(route[1].holdMs, 2200);
  assert.equal(route[1].target.id, "root");
  assert.ok(Object.isFrozen(route) && route.every((step) => Object.isFrozen(step) && Object.isFrozen(step.target)));
});
