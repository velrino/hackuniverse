import { entityHierarchy as hierarchy, parseUniverseCatalog, type EntityKind, type NavigationTarget, type UniverseCatalog, type UniverseCatalogDocument, type UniverseEntity } from "../../universe/domain";

export type LocalWorkspace = Readonly<{
  schemaVersion: 1;
  activeUniverseId: string | null;
  universes: readonly UniverseCatalog[];
}>;

export type EntityDraft = {
  kind: EntityKind;
  name: string;
  description: string;
  parentId?: string;
  href?: string;
  seed?: number;
};

export type WorkspaceDefaults = Record<Exclude<EntityKind, "planet">, string>;
export const workspaceLimits = Object.freeze({ universes: 20, entities: 2000, bytes: 2 * 1024 * 1024 });
export type WorkspaceValidationCode = "invalid" | "limit" | "not-found" | "parent";

export class WorkspaceValidationError extends Error {
  constructor(public readonly code: WorkspaceValidationCode) {
    super(`Invalid local workspace: ${code}`);
    this.name = "WorkspaceValidationError";
  }
}

const empty = Object.freeze({ schemaVersion: 1 as const, activeUniverseId: null, universes: Object.freeze([]) });

export function emptyLocalWorkspace(): LocalWorkspace { return empty; }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new WorkspaceValidationError("invalid");
  return value as Record<string, unknown>;
}

/** The local envelope never weakens the canonical catalog boundary. */
export function parseLocalWorkspace(value: unknown): LocalWorkspace {
  const input = record(value);
  if (input.schemaVersion !== 1 || !Array.isArray(input.universes)) throw new WorkspaceValidationError("invalid");
  if (input.universes.length > workspaceLimits.universes) throw new WorkspaceValidationError("limit");
  let count = 0;
  const ids = new Set<string>();
  const universes = input.universes.map((candidate: unknown) => {
    const document = record(candidate);
    if (!Array.isArray(document.entities)) throw new WorkspaceValidationError("invalid");
    count += document.entities.length;
    if (count > workspaceLimits.entities) throw new WorkspaceValidationError("limit");
    let catalog: UniverseCatalog;
    try { catalog = parseUniverseCatalog(document); }
    catch { throw new WorkspaceValidationError("invalid"); }
    for (const entity of catalog.entities) {
      if (ids.has(entity.id)) throw new WorkspaceValidationError("invalid");
      ids.add(entity.id);
    }
    return catalog;
  });
  const activeUniverseId = input.activeUniverseId;
  if (universes.length === 0 ? activeUniverseId !== null : typeof activeUniverseId !== "string" || !universes.some(({ rootId }) => rootId === activeUniverseId)) {
    throw new WorkspaceValidationError("invalid");
  }
  return Object.freeze({ schemaVersion: 1, activeUniverseId: activeUniverseId as string | null, universes: Object.freeze(universes) });
}

/** Persist documents only; planets are a derived canonical index, never another record set. */
export function workspaceDocument(workspace: LocalWorkspace) {
  return {
    schemaVersion: 1 as const,
    activeUniverseId: workspace.activeUniverseId,
    universes: workspace.universes.map(({ schemaVersion, mode, rootId, initialTarget, entities }) => ({ schemaVersion, mode, rootId, initialTarget, entities })),
  };
}

function locate(workspace: LocalWorkspace, id: string) {
  for (const catalog of workspace.universes) {
    const entity = catalog.entities.find((candidate) => candidate.id === id);
    if (entity) return { catalog, entity };
  }
  throw new WorkspaceValidationError("not-found");
}

function randomSeed(): number { return globalThis.crypto.getRandomValues(new Uint32Array(1))[0]; }

function freshId(workspace: LocalWorkspace, kind: EntityKind): string {
  const ids = new Set(workspace.universes.flatMap(({ entities }) => entities.map(({ id }) => id)));
  for (let attempt = 0; attempt < 8; attempt++) {
    const id = `${kind}-${globalThis.crypto.randomUUID()}`;
    if (!ids.has(id)) return id;
  }
  throw new WorkspaceValidationError("invalid");
}

function entityFields(workspace: LocalWorkspace, draft: EntityDraft) {
  if (!hierarchy.includes(draft.kind)) throw new WorkspaceValidationError("invalid");
  return { id: freshId(workspace, draft.kind), name: draft.name.trim(), description: draft.description, seed: draft.seed ?? randomSeed() };
}

function planetReference(href: string | undefined, previous?: { label: string; href?: string }) {
  if (href === undefined) return previous;
  if (!href.trim()) return previous ? { label: previous.label } : undefined;
  // Canonical parsing validates protocol, credentials and controls below.
  let label: string;
  try { label = new URL(href.trim()).hostname.slice(0, 160); }
  catch { throw new WorkspaceValidationError("invalid"); }
  return { label: previous?.label || label, href: href.trim() };
}

function withCatalog(workspace: LocalWorkspace, catalog: UniverseCatalogDocument, target?: NavigationTarget): LocalWorkspace {
  const exists = workspace.universes.some(({ rootId }) => rootId === catalog.rootId);
  const next = { ...catalog, ...(target ? { initialTarget: target } : {}) };
  return parseLocalWorkspace({
    ...workspace,
    activeUniverseId: catalog.rootId,
    universes: exists ? workspace.universes.map((item) => item.rootId === catalog.rootId ? next : item) : [...workspace.universes, next],
  });
}

export function createWorkspaceEntity(workspace: LocalWorkspace, draft: EntityDraft, defaults: WorkspaceDefaults): { workspace: LocalWorkspace; target: NavigationTarget; universeId: string } {
  if (!hierarchy.includes(draft.kind) || draft.kind !== "planet" && draft.href?.trim()) throw new WorkspaceValidationError("invalid");
  if (draft.kind === "universe") {
    if (draft.parentId !== undefined) throw new WorkspaceValidationError("parent");
    const root: UniverseEntity = { ...entityFields(workspace, draft), kind: "universe", parentId: null };
    const target = { kind: "universe" as const, id: root.id };
    return { workspace: withCatalog(workspace, { schemaVersion: 1, mode: "live", rootId: root.id, entities: [root] }, target), target, universeId: root.id };
  }

  let current = workspace;
  let catalog: UniverseCatalog;
  let parent: UniverseEntity;
  if (draft.parentId !== undefined) {
    ({ catalog, entity: parent } = locate(current, draft.parentId));
    if (parent.kind !== hierarchy[hierarchy.indexOf(draft.kind) - 1]) throw new WorkspaceValidationError("parent");
  } else {
    if (current.universes.length === 0) current = createWorkspaceEntity(current, { kind: "universe", name: defaults.universe, description: "" }, defaults).workspace;
    catalog = current.universes.find(({ rootId }) => rootId === current.activeUniverseId) ?? current.universes[0];
    parent = catalog.entities.find(({ id }) => id === catalog.rootId)!;
    for (const kind of hierarchy.slice(1, hierarchy.indexOf(draft.kind))) {
      const existing = catalog.entities.find((entity) => entity.kind === kind && entity.parentId === parent.id);
      if (existing) parent = existing;
      else {
        const created = createWorkspaceEntity(current, { kind, parentId: parent.id, name: defaults[kind as keyof WorkspaceDefaults], description: "" }, defaults);
        current = created.workspace;
        catalog = current.universes.find(({ rootId }) => rootId === created.universeId)!;
        parent = catalog.entities.find(({ id }) => id === created.target.id)!;
      }
    }
  }
  const common = entityFields(current, draft);
  const reference = draft.kind === "planet" ? planetReference(draft.href) : undefined;
  const entity: UniverseEntity = draft.kind === "planet"
    ? { ...common, kind: "planet", parentId: parent.id, ...(reference ? { reference } : {}) }
    : { ...common, kind: draft.kind, parentId: parent.id };
  const target = { kind: entity.kind, id: entity.id };
  const next = withCatalog(current, { ...catalog, entities: [...catalog.entities, entity] }, target);
  return { workspace: next, target, universeId: catalog.rootId };
}

export function updateWorkspaceEntity(workspace: LocalWorkspace, id: string, draft: EntityDraft): LocalWorkspace {
  const { catalog, entity } = locate(workspace, id);
  if (draft.kind !== entity.kind || entity.kind !== "planet" && draft.href?.trim()) throw new WorkspaceValidationError("invalid");
  let parentId = entity.parentId;
  if (draft.parentId !== undefined) {
    if (entity.kind === "universe") throw new WorkspaceValidationError("parent");
    const destination = locate(workspace, draft.parentId);
    if (destination.catalog.rootId !== catalog.rootId || destination.entity.kind !== hierarchy[hierarchy.indexOf(entity.kind) - 1]) throw new WorkspaceValidationError("parent");
    parentId = destination.entity.id;
  }
  const updated = { ...entity, name: draft.name.trim(), description: draft.description, parentId,
    ...(entity.kind === "planet" ? { reference: planetReference(draft.href, entity.reference) } : {}),
  };
  // ID, kind, seed, tags, classification and star facts stay owned by the entity.
  const next = withCatalog(workspace, { ...catalog, entities: catalog.entities.map((item) => item.id === id ? updated : item) as UniverseEntity[] });
  return workspace.activeUniverseId === catalog.rootId ? next : selectWorkspaceUniverse(next, workspace.activeUniverseId!);
}

export function deleteWorkspaceEntity(workspace: LocalWorkspace, id: string): LocalWorkspace {
  const { catalog, entity } = locate(workspace, id);
  if (entity.kind === "universe") {
    const universes = workspace.universes.filter(({ rootId }) => rootId !== id);
    return parseLocalWorkspace({ ...workspace, universes, activeUniverseId: workspace.activeUniverseId === id ? universes[0]?.rootId ?? null : workspace.activeUniverseId });
  }
  const removed = new Set([id]);
  // Parent kinds strictly increase with depth, so five passes cover any source order.
  for (let depth = 0; depth < hierarchy.length; depth++) {
    for (const item of catalog.entities) if (item.parentId !== null && removed.has(item.parentId)) removed.add(item.id);
  }
  const entities = catalog.entities.filter((item) => !removed.has(item.id));
  const parent = entities.find((item) => item.id === entity.parentId)!;
  const initialTarget = removed.has(catalog.initialTarget.id) ? { kind: parent.kind, id: parent.id } : catalog.initialTarget;
  const next = withCatalog(workspace, { ...catalog, entities, initialTarget });
  return workspace.activeUniverseId === catalog.rootId ? next : selectWorkspaceUniverse(next, workspace.activeUniverseId!);
}

export function selectWorkspaceUniverse(workspace: LocalWorkspace, id: string): LocalWorkspace {
  if (!workspace.universes.some(({ rootId }) => rootId === id)) throw new WorkspaceValidationError("not-found");
  if (workspace.activeUniverseId === id) return workspace;
  return Object.freeze({ ...workspace, activeUniverseId: id });
}
