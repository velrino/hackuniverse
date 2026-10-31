import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { getSceneView } from "../domain/catalog";
import { parseUniverseCatalog } from "../domain/parse-catalog";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { clusterPosition, clusterScale, previewScale } from "./layout";
import { mapAncestorToAnchor, mapSceneViews, type SceneCoordinateMapping } from "./view-coordinates";

const fields = (id: string, seed: number) => ({ id, name: id, description: "Synthetic coordinate fixture.", seed });
const catalog = parseUniverseCatalog({
  schemaVersion: 1, mode: "live", rootId: "universe",
  entities: [
    { ...fields("universe", 1), kind: "universe", parentId: null },
    { ...fields("galaxy-a", 2), kind: "galaxy", parentId: "universe" },
    { ...fields("cloud-a", 3), kind: "cloud", parentId: "galaxy-a" },
    { ...fields("system-a", 4), kind: "system", parentId: "cloud-a" },
    { ...fields("planet-a", 5), kind: "planet", parentId: "system-a" },
    { ...fields("planet-b", 6), kind: "planet", parentId: "system-a" },
    { ...fields("system-b", 7), kind: "system", parentId: "cloud-a" },
    { ...fields("planet-c", 8), kind: "planet", parentId: "system-b" },
    { ...fields("cloud-b", 9), kind: "cloud", parentId: "galaxy-a" },
    { ...fields("system-c", 10), kind: "system", parentId: "cloud-b" },
    { ...fields("galaxy-b", 11), kind: "galaxy", parentId: "universe" },
    { ...fields("cloud-c", 12), kind: "cloud", parentId: "galaxy-b" },
    { ...fields("system-d", 13), kind: "system", parentId: "cloud-c" },
    ...Array.from({ length: 8 }, (_, index) => ({ ...fields(`outer-planet-${index}`, index + 20), kind: "planet", parentId: "system-d" })),
    { ...fields("empty-galaxy", 30), kind: "galaxy", parentId: "universe" },
  ],
});
const view = (id: string) => getSceneView(catalog, id);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} differs from ${expected}`);
function nearVector(actual: THREE.Vector3, expected: THREE.Vector3) {
  actual.toArray().forEach((value, index) => near(value, expected.toArray()[index]));
}
const apply = (mapping: SceneCoordinateMapping, position: THREE.Vector3) => position.clone().multiplyScalar(mapping.scale).add(mapping.offset);

// Three's world matrices provide an independent rendering-coordinate oracle.
const groups = new Map<string, THREE.Group>();
function renderHierarchy(node: SceneNode) {
  const group = new THREE.Group();
  groups.set(node.id, group);
  const children = node.children ?? [];
  const layout = clusterScale(children);
  children.forEach((child, index) => {
    if (child.kind === "planet") return;
    const nested = renderHierarchy(child);
    nested.position.set(...clusterPosition(child, index, children.length, layout.radius));
    nested.scale.setScalar(previewScale(child, layout.marker));
    group.add(nested);
  });
  return group;
}
renderHierarchy(view("universe").anchor!).updateMatrixWorld(true);

function assertRenderedMapping(fromId: string, toId: string) {
  const from = view(fromId);
  const to = view(toId);
  const mapping = mapSceneViews(from, to);
  assert.ok(mapping);
  for (const point of [new THREE.Vector3(), new THREE.Vector3(1, -3, 7), new THREE.Vector3(-23, 19, 31)]) {
    const inWorld = groups.get(from.anchor!.id)!.localToWorld(point.clone());
    const expected = groups.get(to.anchor!.id)!.worldToLocal(inWorld);
    nearVector(apply(mapping, point), expected);
  }
  return mapping;
}

test("identical scene coordinates preserve position and return owned identity offsets", () => {
  for (const id of ["universe", "galaxy-a", "cloud-a", "system-a", "empty-galaxy"]) {
    const mapping = assertRenderedMapping(id, id);
    assert.equal(mapping.scale, 1);
    nearVector(mapping.offset, new THREE.Vector3());
    mapping.offset.x = 123;
    nearVector(mapSceneViews(view(id), view(id))!.offset, new THREE.Vector3());
  }
});

test("adjacent hierarchy handoffs and their reverses match rendered preview transforms", () => {
  for (const [parent, child] of [["universe", "galaxy-a"], ["galaxy-a", "cloud-a"], ["cloud-a", "system-a"]]) {
    const entering = assertRenderedMapping(parent, child);
    const leaving = assertRenderedMapping(child, parent);
    const position = new THREE.Vector3(3, 8, -11);
    nearVector(apply(leaving, apply(entering, position)), position);
  }
});

test("sibling and cross-region system jumps preserve rendered camera position", () => {
  assertRenderedMapping("system-a", "system-b");
  assertRenderedMapping("system-a", "system-c");
  assertRenderedMapping("cloud-b", "system-a");
});

test("cross-galaxy jumps share the universe frame, including empty destinations", () => {
  assertRenderedMapping("system-a", "system-d");
  assertRenderedMapping("system-d", "galaxy-a");
  assertRenderedMapping("cloud-b", "empty-galaxy");
});

test("deep planet destinations retain their full parent system coordinate space", () => {
  const system = view("system-a");
  const planet = view("planet-a");
  assert.equal(planet.anchor?.id, system.anchor?.id);
  const sameSystem = mapSceneViews(system, planet);
  assert.ok(sameSystem);
  assert.equal(sameSystem.scale, 1);
  nearVector(sameSystem.offset, new THREE.Vector3());
  assertRenderedMapping("planet-a", "outer-planet-7");
});

test("ancestor mapping rejects missing relationships and nonfinite display input", () => {
  const leaf = view("system-a");
  const chain = [...leaf.ancestors!, leaf.anchor!];
  for (const index of [-1, 0.5, chain.length, NaN, Infinity]) assert.equal(mapAncestorToAnchor(chain, index), null);
  assert.equal(mapAncestorToAnchor([], 0), null);
  assert.equal(mapAncestorToAnchor([chain[0], chain.at(-1)!], 0), null);
  const badChild = { ...chain[1], seed: Infinity };
  const badParent = { ...chain[0], children: [badChild] };
  assert.equal(mapAncestorToAnchor([badParent, badChild], 0), null);
  const wrongKind = { ...chain[1], kind: "cloud" as const };
  assert.equal(mapAncestorToAnchor([chain[0], wrongKind], 0), null);
});

test("scene mapping has no fallback across unrelated roots or malformed chains", () => {
  const root = view("universe");
  const unrelated: UniverseSceneView = { ...root, anchor: { ...root.anchor!, id: "other-root" } };
  assert.equal(mapSceneViews(root, unrelated), null);
  assert.equal(mapSceneViews({ key: "missing", mode: "cluster", nodes: [] }, root), null);
  assert.equal(mapSceneViews(root, { key: "missing", mode: "cluster", nodes: [] }), null);
  const broken = { ...view("system-a"), ancestors: [root.anchor!] };
  assert.equal(mapSceneViews(root, broken), null);
  assert.equal(mapSceneViews(broken, broken), null, "matching anchor IDs cannot bypass invalid ancestor links");
});
