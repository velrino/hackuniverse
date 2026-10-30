import { useCallback, useMemo, useState } from "react";
import { findPlanet, getBreadcrumbs, getChildren, getEntity, getParent, getPlanetCount, getSceneView } from "../domain/catalog";
import type { NavigationTarget, UniverseCatalog } from "../domain/types";

type Request = { token: string; target: NavigationTarget };
export function useUniverseNavigation(catalog: UniverseCatalog, managementRequest?: Request, locationRequest?: Request) {
  const [selection, setSelection] = useState(() => ({ target: locationRequest?.target ?? managementRequest?.target ?? catalog.initialTarget, requestToken: locationRequest?.token ?? managementRequest?.token, supersededManagement: locationRequest ? managementRequest?.token : undefined }));
  const request = locationRequest ?? (managementRequest?.token !== selection.supersededManagement ? managementRequest : undefined);
  const target = request && selection.requestToken !== request.token ? request.target : selection.target;
  if (request && selection.requestToken !== request.token) {
    // Persist a consumed external request before the host releases its command.
    setSelection({ target: request.target, requestToken: request.token, supersededManagement: locationRequest ? managementRequest?.token : undefined });
  }
  const current = getEntity(catalog, target) ?? getEntity(catalog, catalog.initialTarget) ?? getEntity(catalog, catalog.rootId)!;
  const resolvedTarget = useMemo<NavigationTarget>(() => ({ kind: current.kind, id: current.id }), [current]);
  const parent = getParent(catalog, resolvedTarget);
  const view = useMemo(() => getSceneView(catalog, resolvedTarget), [catalog, resolvedTarget]);
  const navigate = useCallback((id: string) => {
    const entity = getEntity(catalog, id);
    if (entity) setSelection((previous) => ({ ...previous, target: { kind: entity.kind, id: entity.id }, requestToken: request?.token ?? previous.requestToken }));
  }, [catalog, request?.token]);

  return {
    target: resolvedTarget, current, parent, view, navigate,
    breadcrumbs: getBreadcrumbs(catalog, resolvedTarget),
    children: getChildren(catalog, resolvedTarget),
    count: getPlanetCount(catalog, resolvedTarget.id),
    planet: resolvedTarget.kind === "planet" ? findPlanet(catalog, resolvedTarget.id) : undefined,
    goWider: () => { if (parent) navigate(parent.id); },
  };
}
