import type { SceneNode } from "../domain/types";
import { getPlanetAppearance } from "../domain/planet-appearance";
import { seededRandom } from "./textures";

/** Normalized display units: each wider level covers a progressively larger region. */
export function clusterScale(nodes: readonly Pick<SceneNode, "kind">[]) {
  const kind = nodes[0]?.kind;
  if (kind === "galaxy" || kind === "universe") return { radius: 600, marker: 150 };
  if (kind === "cloud") return { radius: 220, marker: 46 };
  return { radius: 90, marker: 11 };
}

/** Stable positions are reused by the wide map and the corresponding nested markers. */
export function clusterPosition(node: SceneNode, index: number, total: number, spread: number): [number, number, number] {
  const random = seededRandom(node.seed);
  const radius = spread * (0.22 + Math.sqrt((index + 0.5) / Math.max(1, total)) * 0.43);
  const angle = index * 2.399963 + (random() - 0.5) * 0.45;
  return [Math.cos(angle) * radius, (random() - 0.5) * spread * 0.18, Math.sin(angle) * radius];
}

export function nodeGeometrySignature(node: SceneNode): string {
  return `${node.id}:${node.kind}:${node.seed}:${node.color}:${node.count}[${(node.children ?? []).map(nodeGeometrySignature).join(",")}]`;
}

export const systemOrbit = (index: number) => 9 + Math.min(index, 4) * 6 + Math.max(0, index - 4) * 5;
export const systemRadius = (count: number) => Math.max(28, systemOrbit(Math.max(0, count - 1)) + 9);
export const planetRadius = (seed: number) => getPlanetAppearance(seed).radius;
export const orbitalSpeed = (orbit: number) => 0.06 * Math.pow(9 / orbit, 1.5);
export const orbitalAngle = (index: number, elapsed: number) => index * 2.39996 + 0.4 + elapsed * orbitalSpeed(systemOrbit(index));

/** Exact child-coordinate scale used by a parent marker and hierarchy handoff. */
export function previewScale(node: Pick<SceneNode, "kind"> & { children?: readonly Pick<SceneNode, "kind">[] }, extent: number) {
  if (node.kind === "system") return extent / systemRadius((node.children ?? []).filter((child) => child.kind === "planet").length);
  return extent * (node.kind === "cloud" ? 1.1 : 1) / clusterScale(node.children ?? []).radius;
}
