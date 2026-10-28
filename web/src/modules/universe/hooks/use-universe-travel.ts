import { useCallback, useEffect, useRef, useState } from "react";
import { getBreadcrumbs, getEntity } from "../domain/catalog";
import type { UniverseCatalog } from "../domain/types";

export type PendingTravel = { destinationId: string; systemId: string; name: string };

/** Presentation travel never creates records or starts an import. */
export function useUniverseTravel(catalog: UniverseCatalog, navigate: (id: string) => void) {
  const [pending, setPending] = useState<PendingTravel | null>(null);
  const lastSystem = useRef(catalog.initialSystemId);
  const complete = useCallback(() => {
    if (!pending) return;
    const destination = getEntity(catalog, pending.destinationId);
    const system = getBreadcrumbs(catalog, pending.destinationId).find((entity) => entity.kind === "system");
    if (destination && system?.id === pending.systemId) {
      lastSystem.current = system.id;
      navigate(destination.id);
    }
    setPending(null);
  }, [catalog, navigate, pending]);
  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(complete, 3000);
    return () => window.clearTimeout(timer);
  }, [pending, complete]);
  const requestNavigation = useCallback((id: string) => {
    if (pending) return;
    const destination = getEntity(catalog, id);
    if (!destination) return;
    const system = getBreadcrumbs(catalog, id).find((entity) => entity.kind === "system");
    if (system && system.id !== lastSystem.current) setPending({ destinationId: id, systemId: system.id, name: system.name });
    else navigate(id);
  }, [catalog, navigate, pending]);
  return { pending, requestNavigation, complete, cancel: () => setPending(null) };
}
