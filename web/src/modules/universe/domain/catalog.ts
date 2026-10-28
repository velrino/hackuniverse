import type {
  EntityKind,
  NavigationTarget,
  SceneNode,
  SystemStar,
  UniverseCatalog,
  UniverseEntity,
  UniverseSceneView,
  UniversePlanet,
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

export function findPlanet(catalog: UniverseCatalog, id: string): UniversePlanet | undefined {
  return catalog.planets.find((planet) => planet.id === id);
}

export function getSystemStar(catalog: UniverseCatalog, systemId: string): SystemStar | undefined {
  const entity = getEntity(catalog, systemId);
  return entity?.kind === "system" ? entity.star : undefined;
}

/** Empty queries return all planets, in their stable catalog order. */
export function searchPlanets(catalog: UniverseCatalog, query: string): UniversePlanet[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return catalog.planets.filter((planet) => {
    const text = [planet.name, planet.description, planet.reference?.label, planet.reference?.href, ...(planet.tags ?? [])]
      .join(" ").toLowerCase();
    return terms.every((term) => text.includes(term));
  });
}

export function getPlanetCount(catalog: UniverseCatalog, target: EntityReference): number {
  const entity = getEntity(catalog, target);
  if (!entity) return 0;
  if (entity.kind === "planet") return findPlanet(catalog, entity.id) ? 1 : 0;

  return indexCatalog(catalog).counts.get(entity.id) ?? 0;
}

/** One projection owns these indexes; nothing is retained across catalogs or calls. */
function indexCatalog(catalog: UniverseCatalog) {
  const byId = new Map<string, UniverseEntity>();
  const children = new Map<string, UniverseEntity[]>();
  const planets = new Map<string, UniversePlanet>();
  const counts = new Map<string, number>();
  for (const entity of catalog.entities) {
    if (!byId.has(entity.id)) byId.set(entity.id, entity);
    if (entity.parentId !== null) {
      const siblings = children.get(entity.parentId);
      if (siblings) siblings.push(entity);
      else children.set(entity.parentId, [entity]);
    }
  }
  for (const planet of catalog.planets) {
    if (!planets.has(planet.id)) planets.set(planet.id, planet);
    const seen = new Set<string>();
    let entity = byId.get(planet.id);
    while (entity && !seen.has(entity.id)) {
      seen.add(entity.id);
      counts.set(entity.id, (counts.get(entity.id) ?? 0) + 1);
      entity = entity.parentId === null ? undefined : byId.get(entity.parentId);
    }
  }
  return { byId, children, planets, counts };
}

function sceneNode(index: ReturnType<typeof indexCatalog>, entity: UniverseEntity, projected: Map<string, SceneNode>, depth = 0): SceneNode {
  const planet = entity.kind === "planet" ? index.planets.get(entity.id) : undefined;
  const node: SceneNode = {
    id: entity.id,
    kind: entity.kind,
    name: entity.name,
    subtitle: planet?.reference?.label || entity.description,
    count: entity.kind === "planet" ? Number(Boolean(planet)) : index.counts.get(entity.id) ?? 0,
    seed: entity.seed,
    color: entity.kind === "planet" ? getPlanetAppearance(entity.seed).color : groupColors[entity.kind],
    ...(entity.kind !== "planet" && depth < 4 ? {
      children: (index.children.get(entity.id) ?? []).map((child) => sceneNode(index, child, projected, depth + 1)),
    } : {}),
  };
  projected.set(node.id, node);
  return node;
}

export function getSceneView(catalog: UniverseCatalog, target: EntityReference): UniverseSceneView {
  let entity = getEntity(catalog, target);
  if (!entity) return { key: "missing", mode: "cluster", nodes: [] };
  const index = indexCatalog(catalog);

  if (entity.kind === "planet") {
    const system = index.byId.get(entity.parentId);
    if (system?.kind !== "system") return { key: "missing", mode: "cluster", nodes: [] };
    entity = system;
  }

  const root = index.byId.get(catalog.rootId);
  if (root?.kind !== "universe") return { key: "missing", mode: "cluster", nodes: [] };
  const projected = new Map<string, SceneNode>();
  sceneNode(index, root, projected);
  const anchor = projected.get(entity.id);
  if (!anchor) return { key: "missing", mode: "cluster", nodes: [] };
  const ancestors: SceneNode[] = [];
  let parentId = entity.parentId;
  while (parentId !== null && ancestors.length < 4) {
    const parent = index.byId.get(parentId);
    const parentNode = projected.get(parentId);
    if (!parent || !parentNode) return { key: "missing", mode: "cluster", nodes: [] };
    ancestors.unshift(parentNode);
    parentId = parent.parentId;
  }
  if (parentId !== null) return { key: "missing", mode: "cluster", nodes: [] };
  return {
    key: `${entity.kind}:${entity.id}`,
    mode: entity.kind === "system" ? "system" : "cluster",
    anchor,
    ancestors,
    nodes: anchor.children ?? [],
    ...(entity.kind === "system" ? { starName: entity.star?.name ?? entity.name } : {}),
  };
}
