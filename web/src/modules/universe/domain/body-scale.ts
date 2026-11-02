import type { SceneNode, UniverseSceneView } from "./types";

export type BodyScaleMode = "illustrative" | "proportional";
export const defaultBodyScale: BodyScaleMode = "illustrative";
export const bodyScaleStorageKey = "hackuniverse.body-scale.v1";
export const isBodyScaleMode = (value: unknown): value is BodyScaleMode => value === "illustrative" || value === "proportional";
export function bodyScaleFromQuery(values: readonly string[]): BodyScaleMode | null {
  return values.length === 1 && isBodyScaleMode(values[0]) ? values[0] : null;
}

/** Keep physical catalog facts intact; only the scene's size projection changes. */
export function projectBodyScale(view: UniverseSceneView, mode: BodyScaleMode): UniverseSceneView {
  if (mode === "proportional") return view;
  const projected = new Map<SceneNode, SceneNode>();
  const node = (source: SceneNode): SceneNode => {
    const existing = projected.get(source);
    if (existing) return existing;
    const result = { ...source };
    delete result.radiusKm;
    projected.set(source, result);
    if (source.children) result.children = source.children.map(node);
    return result;
  };
  return { ...view, nodes: view.nodes.map(node), ...(view.anchor ? { anchor: node(view.anchor) } : {}), ...(view.ancestors ? { ancestors: view.ancestors.map(node) } : {}) };
}
