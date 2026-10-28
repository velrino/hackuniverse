import * as THREE from "three";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { clusterPosition, clusterScale, previewScale, systemRadius } from "./layout";
import {
  createGalaxyVisual, createRoundPointMaterial,
  updateGalaxyVisual, type ClusterVisualResources,
} from "./cluster-visuals";

type Similarity = { scale: number; offset: THREE.Vector3 };
type Candidate = { node: SceneNode; position: THREE.Vector3; distance: number };

/** Map a complete ancestor overview into the current anchor's coordinates. */
function intoCurrent(chain: readonly SceneNode[], ancestorIndex: number): Similarity | null {
  let scale = 1;
  const offset = new THREE.Vector3();
  for (let index = ancestorIndex; index < chain.length - 1; index++) {
    const children = chain[index].children ?? [];
    const childIndex = children.findIndex((child) => child.id === chain[index + 1].id);
    if (childIndex < 0) return null;
    const child = children[childIndex];
    const layout = clusterScale(children);
    const childScale = previewScale(child, layout.marker);
    if (!Number.isFinite(childScale) || childScale <= 0) return null;
    const position = clusterPosition(child, childIndex, children.length, layout.radius);
    offset.set(
      (offset.x - position[0]) / childScale,
      (offset.y - position[1]) / childScale,
      (offset.z - position[2]) / childScale,
    );
    scale /= childScale;
  }
  return { scale, offset };
}

function mappedGroup(parent: THREE.Group, name: string, mapping: Similarity) {
  const group = new THREE.Group();
  group.name = name;
  group.position.copy(mapping.offset);
  group.scale.setScalar(mapping.scale);
  parent.add(group);
  return group;
}

function contextRadius(root: THREE.Group) {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return 0;
  let radius = new THREE.Vector3(
    Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
    Math.max(Math.abs(bounds.min.z), Math.abs(bounds.max.z)),
  ).length();
  const center = new THREE.Vector3();
  const scale = new THREE.Vector3();
  root.traverse((object) => {
    if (!(object instanceof THREE.Sprite)) return;
    object.getWorldPosition(center);
    object.getWorldScale(scale);
    // Sprites turn toward the camera; enclose every billboard orientation.
    radius = Math.max(radius, center.length() + Math.max(scale.x, scale.y) * Math.SQRT1_2);
  });
  return Number.isFinite(radius) ? radius * 1.03 : 0;
}

/** Visual-only context; its caller owns geometry/material disposal and shared maps. */
export function createSurroundingContext(
  view: UniverseSceneView,
  resources: ClusterVisualResources,
  { mobile, elapsed }: { mobile: boolean; elapsed: number },
) {
  const root = new THREE.Group();
  root.name = "surrounding-context";
  const updates: ((elapsed: number) => void)[] = [];
  const update = (time: number) => { for (const animate of updates) animate(time); };
  const anchor = view.anchor;
  if (!anchor) return { root, update, radius: 0 };

  const chain = [...(view.ancestors ?? []), anchor];
  const mappings = chain.map((_, index) => intoCurrent(chain, index));
  const radius = anchor.kind === "system"
    ? systemRadius((anchor.children ?? []).filter((child) => child.kind === "planet").length)
    : clusterScale(view.nodes).radius;
  const galaxyIndex = chain.findLastIndex((node) => node.kind === "galaxy");

  if (galaxyIndex >= 0 && mappings[galaxyIndex]) {
    const node = chain[galaxyIndex];
    const mapping = mappings[galaxyIndex]!;
    const group = mappedGroup(root, "galaxy-context", mapping);
    const extent = clusterScale(node.children ?? []).radius;
    const visual = createGalaxyVisual(group, node.seed, extent, resources, elapsed);
    // PointsMaterial does not inherit an Object3D's scale for particle size.
    if (visual.dust.material instanceof THREE.PointsMaterial) visual.dust.material.size *= mapping.scale;
    // Grouping glows give way to the actual contents at deeper zoom levels.
    visual.core.visible = anchor.kind === "galaxy";
    updates.push((time) => updateGalaxyVisual(visual, node.seed, extent, time));
  }

  const candidates: Candidate[] = [];
  for (let index = 0; index < chain.length - 1; index++) {
    const mapping = mappings[index];
    if (!mapping) continue;
    const children = chain[index].children ?? [];
    const branchId = chain[index + 1].id;
    const layout = clusterScale(children);
    children.forEach((node, childIndex) => {
      if (node.id === branchId) return;
      const position = new THREE.Vector3(...clusterPosition(node, childIndex, children.length, layout.radius));
      position.multiplyScalar(mapping.scale).add(mapping.offset);
      candidates.push({ node, position, distance: position.lengthSq() });
    });
  }
  candidates.sort((a, b) => a.distance - b.distance || (a.node.id < b.node.id ? -1 : a.node.id > b.node.id ? 1 : 0));
  const nearest = candidates.slice(0, mobile ? 12 : 24);
  if (nearest.length) {
    const positions = new Float32Array(nearest.length * 3);
    const colors = new Float32Array(positions.length);
    const color = new THREE.Color();
    nearest.forEach(({ node, position }, index) => {
      position.toArray(positions, index * 3);
      color.setHSL(((node.seed % 997) / 997 * 0.72 + 0.04) % 1, 0.45, 0.78).multiplyScalar(1.5);
      color.toArray(colors, index * 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = createRoundPointMaterial(radius * 0.045, 0xffffff, 0.8, resources.galaxyPointMap, resources.pixelRatio);
    material.vertexColors = true;
    material.blending = THREE.AdditiveBlending;
    const points = new THREE.Points(geometry, material);
    points.name = "surrounding-destinations";
    root.add(points);
  }
  return { root, update, radius: contextRadius(root) };
}
