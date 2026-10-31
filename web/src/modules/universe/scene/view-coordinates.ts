import * as THREE from "three";
import type { SceneNode, UniverseSceneView } from "../domain/types";
import { clusterPosition, clusterScale, previewScale } from "./layout";

export type SceneCoordinateMapping = { scale: number; offset: THREE.Vector3 };

const finiteVector = (value: THREE.Vector3) => Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

/** Convert an ancestor overview's coordinates into its descendant anchor's space. */
export function mapAncestorToAnchor(chain: readonly SceneNode[], ancestorIndex: number): SceneCoordinateMapping | null {
  if (!Number.isInteger(ancestorIndex) || ancestorIndex < 0 || ancestorIndex >= chain.length) return null;
  let scale = 1;
  const offset = new THREE.Vector3();
  for (let index = ancestorIndex; index < chain.length - 1; index++) {
    const children = chain[index].children ?? [];
    const childIndex = children.findIndex((child) => child.id === chain[index + 1].id && child.kind === chain[index + 1].kind);
    if (childIndex < 0) return null;
    const child = children[childIndex];
    if (!Number.isFinite(child.seed)) return null;
    const layout = clusterScale(children);
    const childScale = previewScale(child, layout.marker);
    if (!Number.isFinite(childScale) || childScale <= 0) return null;
    const position = new THREE.Vector3(...clusterPosition(child, childIndex, children.length, layout.radius));
    if (!finiteVector(position)) return null;
    offset.sub(position).divideScalar(childScale);
    scale /= childScale;
    if (!Number.isFinite(scale) || scale <= 0 || !finiteVector(offset)) return null;
  }
  return { scale, offset };
}

/** Keep a camera pose in the same rendered space while moving between branches. */
export function mapSceneViews(from: UniverseSceneView, to: UniverseSceneView): SceneCoordinateMapping | null {
  if (!from.anchor || !to.anchor) return null;
  const fromChain = [...(from.ancestors ?? []), from.anchor];
  const toChain = [...(to.ancestors ?? []), to.anchor];
  if (!mapAncestorToAnchor(fromChain, 0) || !mapAncestorToAnchor(toChain, 0)) return null;
  let commonIndex = -1;
  while (commonIndex + 1 < Math.min(fromChain.length, toChain.length)) {
    const index = commonIndex + 1;
    if (fromChain[index].id !== toChain[index].id || fromChain[index].kind !== toChain[index].kind) break;
    commonIndex = index;
  }
  if (commonIndex < 0) return null;
  const fromCommon = mapAncestorToAnchor(fromChain, commonIndex);
  const toCommon = mapAncestorToAnchor(toChain, commonIndex);
  if (!fromCommon || !toCommon) return null;
  const scale = toCommon.scale / fromCommon.scale;
  const offset = toCommon.offset.clone().addScaledVector(fromCommon.offset, -scale);
  return Number.isFinite(scale) && scale > 0 && finiteVector(offset) ? { scale, offset } : null;
}
