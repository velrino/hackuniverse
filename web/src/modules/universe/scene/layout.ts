import type { SceneNode } from "../domain/types";
import { getPlanetAppearance } from "../domain/planet-appearance";
import { seededRandom } from "./textures";

/** Normalized display units: each wider level covers a progressively larger region. */
export function clusterScale(nodes: readonly Pick<SceneNode, "kind">[]) {
  const kind = nodes[0]?.kind;
  if (kind === "galaxy" || kind === "universe") {
    return { radius: 600, marker: 150 * Math.min(1, Math.sqrt(5 / Math.max(1, nodes.length))) };
  }
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
  return `${node.id}:${node.kind}:${node.seed}:${node.color}:${node.radiusKm}:${node.count}[${(node.children ?? []).map(nodeGeometrySignature).join(",")}]`;
}

export const systemOrbit = (index: number, centralRadius = 3.4) => Math.max(0, centralRadius - 6.8) * 2 + 9 + Math.min(index, 4) * 6 + Math.max(0, index - 4) * 5;
export const systemRadius = (count: number, centralRadius = 3.4) => Math.max(28, systemOrbit(Math.max(0, count - 1), centralRadius) + 9);
export const physicalRadius = (radiusKm: number) => radiusKm * 3.4 / 695700;
export const starRadius = (node?: Pick<SceneNode, "radiusKm">) => node?.radiusKm === null ? 0.02 : node?.radiusKm !== undefined ? physicalRadius(node.radiusKm) : 6.8;
export const planetRadius = (seed: number, radiusKm?: number | null) => radiusKm === null ? 0.02 : radiusKm !== undefined ? physicalRadius(radiusKm) : getPlanetAppearance(seed).radius;
export const orbitalSpeed = (orbit: number) => 0.09 * Math.pow(9 / orbit, 1.5);
export const orbitalAngle = (index: number, elapsed: number, centralRadius = 3.4) => index * 2.39996 + 0.4 + elapsed * orbitalSpeed(systemOrbit(index, centralRadius));

/** Exact child-coordinate scale used by a parent marker and hierarchy handoff. */
export function previewScale(node: Pick<SceneNode, "kind" | "radiusKm"> & { children?: readonly Pick<SceneNode, "kind">[] }, extent: number) {
  if (node.kind === "system") return extent / systemRadius(node.radiusKm !== undefined ? 8 : (node.children ?? []).filter((child) => child.kind === "planet").length);
  return extent * (node.kind === "cloud" ? 1.1 : 1) / clusterScale(node.children ?? []).radius;
}
