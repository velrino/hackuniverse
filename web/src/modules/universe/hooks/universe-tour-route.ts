import type { NavigationTarget, UniverseCatalog, UniverseEntity } from "../domain/types";
import type { UniverseTourStep } from "./use-universe-tour";

function snapshotStep(step: UniverseTourStep): UniverseTourStep {
  return Object.freeze({
    target: Object.freeze({ kind: step.target.kind, id: step.target.id }),
    ...(step.holdMs === undefined ? {} : { holdMs: step.holdMs }),
    ...(step.motion === undefined ? {} : { motion: step.motion }),
  });
}

/** Adjacent approach steps lead into the configured tour without changing its outward tail. */
export function buildManualUniverseTour(
  catalog: UniverseCatalog,
  currentTarget: NavigationTarget,
  configuredSteps: readonly UniverseTourStep[],
): readonly UniverseTourStep[] | null {
  if (!configuredSteps.length) return null;
  const byId = new Map(catalog.entities.map((entity) => [entity.id, entity]));

  function path(target: NavigationTarget): UniverseEntity[] | null {
    let entity = byId.get(target.id);
    if (!entity || entity.kind !== target.kind) return null;
    if (entity.kind === "planet") {
      entity = byId.get(entity.parentId);
      if (entity?.kind !== "system") return null;
    }
    const result: UniverseEntity[] = [];
    const seen = new Set<string>();
    while (entity) {
      if (seen.has(entity.id)) return null;
      seen.add(entity.id);
      result.unshift(entity);
      if (entity.parentId === null) break;
      entity = byId.get(entity.parentId);
      if (!entity) return null;
    }
    const root = result[0];
    return root?.id === catalog.rootId && root.kind === "universe" && root.parentId === null ? result : null;
  }

  const currentPath = path(currentTarget);
  const destinations = configuredSteps.map((step) => path(step.target));
  if (!currentPath || destinations.some((destination) => !destination)) return null;
  const firstPath = destinations[0]!;
  let common = 0;
  while (common < Math.min(currentPath.length, firstPath.length) && currentPath[common].id === firstPath[common].id) common++;
  if (!common) return null;

  const route: UniverseTourStep[] = [];
  const approach = (entity: UniverseEntity) => route.push(snapshotStep({
    target: { kind: entity.kind, id: entity.id }, holdMs: 0, motion: "approach",
  }));
  for (let index = currentPath.length - 2; index >= common - 1; index--) approach(currentPath[index]);
  for (let index = common; index < firstPath.length; index++) approach(firstPath[index]);

  const first = snapshotStep({ target: configuredSteps[0].target, holdMs: 1000, motion: "approach" });
  const last = route.at(-1);
  if (last?.target.id === first.target.id && last.target.kind === first.target.kind) route[route.length - 1] = first;
  else route.push(first);
  route.push(...configuredSteps.slice(1).map(snapshotStep));
  return Object.freeze(route);
}
