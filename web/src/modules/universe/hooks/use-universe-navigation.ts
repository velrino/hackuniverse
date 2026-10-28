import { useCallback, useMemo, useState } from "react";
import { findPlanet, getBreadcrumbs, getChildren, getEntity, getParent, getPlanetCount, getSceneView } from "../domain/catalog";
import type { NavigationTarget, UniverseCatalog } from "../domain/types";

export function useUniverseNavigation(catalog: UniverseCatalog) {
  const [target, setTarget] = useState<NavigationTarget>(catalog.initialTarget);
  const current = getEntity(catalog, target) ?? getEntity(catalog, catalog.initialTarget) ?? getEntity(catalog, catalog.rootId)!;
  const resolvedTarget = useMemo<NavigationTarget>(() => ({ kind: current.kind, id: current.id }), [current]);
  const parent = getParent(catalog, resolvedTarget);
  const view = useMemo(() => getSceneView(catalog, resolvedTarget), [catalog, resolvedTarget]);
  const navigate = useCallback((id: string) => {
    const entity = getEntity(catalog, id);
    if (entity) setTarget({ kind: entity.kind, id: entity.id });
  }, [catalog]);

  return {
    target: resolvedTarget, current, parent, view, navigate,
    breadcrumbs: getBreadcrumbs(catalog, resolvedTarget),
    children: getChildren(catalog, resolvedTarget),
    count: getPlanetCount(catalog, resolvedTarget.id),
    planet: resolvedTarget.kind === "planet" ? findPlanet(catalog, resolvedTarget.id) : undefined,
    goWider: () => { if (parent) navigate(parent.id); },
  };
}
