import type {
  EntityKind,
  NavigationTarget,
  SceneNode,
  UniverseCatalog,
  UniverseEntity,
  UniverseSceneView,
  WebsitePlanet,
} from "./types";
import { getPlanetAppearance } from "./planet-appearance";

type EntityReference = NavigationTarget | string;

const groupColors: Record<EntityKind, string> = {
  universe: "#42e8f4",
  galaxy: "#72dafa",
  cloud: "#8ef2ed",
  system: "#67bee8",
  planet: "#42e8f4",
};

export function getEntity(catalog: UniverseCatalog, target: EntityReference): UniverseEntity | undefined {
  const id = typeof target === "string" ? target : target.id;
  const entity = catalog.entities.find((candidate) => candidate.id === id);
  return entity && (typeof target === "string" || entity.kind === target.kind) ? entity : undefined;
}

export function getChildren(catalog: UniverseCatalog, target: EntityReference): UniverseEntity[] {
  const entity = getEntity(catalog, target);
  return entity ? catalog.entities.filter((candidate) => candidate.parentId === entity.id) : [];
}

export function getParent(catalog: UniverseCatalog, target: EntityReference): UniverseEntity | undefined {
  const entity = getEntity(catalog, target);
  return entity?.parentId ? getEntity(catalog, entity.parentId) : undefined;
}

export function getBreadcrumbs(catalog: UniverseCatalog, target: EntityReference): UniverseEntity[] {
  const breadcrumbs: UniverseEntity[] = [];
  const seen = new Set<string>();
  let entity = getEntity(catalog, target);

  while (entity && !seen.has(entity.id)) {
    seen.add(entity.id);
    breadcrumbs.unshift(entity);
    entity = getParent(catalog, entity.id);
  }

  return breadcrumbs;
}

export function findPlanet(catalog: UniverseCatalog, id: string): WebsitePlanet | undefined {
  return catalog.planets.find((planet) => planet.id === id);
}

/** Empty queries return all demo planets, in their stable catalog order. */
export function searchPlanets(catalog: UniverseCatalog, query: string): WebsitePlanet[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.planets.filter((planet) => {
    const text = [planet.name, planet.description, planet.source.url, planet.source.query]
      .join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getPlanetCount(catalog: UniverseCatalog, target: EntityReference): number {
  const entity = getEntity(catalog, target);
  if (!entity) return 0;
  if (entity.kind === "planet") return findPlanet(catalog, entity.id) ? 1 : 0;

  return catalog.planets.reduce((count, planet) => {
    const belongs = getBreadcrumbs(catalog, planet.id).some((ancestor) => ancestor.id === entity.id);
    return count + (belongs ? 1 : 0);
  }, 0);
}

function sceneNode(catalog: UniverseCatalog, entity: UniverseEntity, depth = 0): SceneNode {
  const planet = entity.kind === "planet" ? findPlanet(catalog, entity.id) : undefined;
  return {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    subtitle: planet ? new URL(planet.source.url).hostname : entity.description,
    count: getPlanetCount(catalog, entity.id),
    seed: entity.seed,
    color: entity.kind === "planet" ? getPlanetAppearance(entity.seed).color : groupColors[entity.kind],
    ...(entity.kind !== "planet" && depth < 4 ? {
      children: getChildren(catalog, entity.id).map((child) => sceneNode(catalog, child, depth + 1)),
    } : {}),
  };
}

export function getSceneView(catalog: UniverseCatalog, target: EntityReference): UniverseSceneView {
  const entity = getEntity(catalog, target);
  if (!entity) return { key: "missing", mode: "cluster", nodes: [] };

  if (entity.kind === "planet") {
    const system = getParent(catalog, entity.id);
    return system?.kind === "system"
      ? getSceneView(catalog, system.id)
      : { key: "missing", mode: "cluster", nodes: [] };
  }

  return {
    key: `${entity.kind}:${entity.id}`,
    mode: entity.kind === "system" ? "system" : "cluster",
    nodes: getChildren(catalog, entity.id).map((child) => sceneNode(catalog, child)),
    ...(entity.kind === "system" ? { starName: entity.name } : {}),
  };
}
