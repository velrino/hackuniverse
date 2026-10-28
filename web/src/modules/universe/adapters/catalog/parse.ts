import type { EntityKind, UniverseCatalog, UniverseEntity, WebsitePlanet } from "../../domain/types";

type DataRecord = Record<string, unknown>;
const groupKinds = new Set<EntityKind>(["universe", "galaxy", "cloud", "system"]);
const parentKind: Record<Exclude<EntityKind, "universe">, EntityKind> = {
  galaxy: "universe", cloud: "galaxy", system: "cloud", planet: "system",
};

function fail(message: string): never {
  throw new Error(`Invalid demo universe: ${message}`);
}

function object(value: unknown, label: string): DataRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${label} must be an object`);
  return value as DataRecord;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function text(value: unknown, label: string, limit = 1000): string {
  if (typeof value !== "string" || !value.trim() || value.length > limit) fail(`${label} must be nonempty text, at most ${limit} characters`);
  return value;
}

function identifier(value: unknown, label: string): string {
  const id = text(value, label, 100);
  if (!/^[a-z][a-z0-9-]+$/.test(id)) fail(`${label} must be a stable lowercase identifier`);
  return id;
}

function integer(value: unknown, label: string, min = 0, max = 0xffffffff): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) fail(`${label} must be an integer from ${min} to ${max}`);
  return value;
}

/** Validate the human-edited fixture once; this is not a live-provider decoder. */
export function parseDemoUniverse(input: unknown): UniverseCatalog {
  const data = object(input, "root");
  if (data.schemaVersion !== 1 || data.mode !== "demo") fail("schemaVersion=1 and mode=demo are required");
  const rootId = identifier(data.rootId, "rootId");
  const initialSystemId = identifier(data.initialSystemId, "initialSystemId");
  const entities: UniverseEntity[] = [];
  const planets: WebsitePlanet[] = [];
  const byId = new Map<string, UniverseEntity>();
  const sourceUrls = new Set<string>();
  const batchIds = new Set<string>();

  const addEntity = (entity: UniverseEntity) => {
    if (byId.has(entity.id)) fail(`duplicate entity ID ${entity.id}`);
    byId.set(entity.id, entity);
    entities.push(entity);
  };

  for (const [index, value] of array(data.hierarchy, "hierarchy").entries()) {
    const row = object(value, `hierarchy[${index}]`);
    if (typeof row.kind !== "string" || !groupKinds.has(row.kind as EntityKind)) fail(`hierarchy[${index}] has an unsupported kind`);
    addEntity({
      id: identifier(row.id, "entity.id"),
      kind: row.kind as EntityKind,
      parentId: row.parentId === null ? null : identifier(row.parentId, "entity.parentId"),
      name: text(row.name, "entity.name", 160),
      description: text(row.description, "entity.description"),
      seed: integer(row.seed, "entity.seed"),
    });
  }

  for (const [batchIndex, value] of array(data.searchBatches, "searchBatches").entries()) {
    const batch = object(value, `searchBatches[${batchIndex}]`);
    const batchId = identifier(batch.id, "batch.id");
    if (batchIds.has(batchId)) fail(`duplicate batch ID ${batchId}`);
    batchIds.add(batchId);
    const systemId = identifier(batch.systemId, "batch.systemId");
    if (byId.get(systemId)?.kind !== "system") fail(`batch ${batchId} has an unknown system`);
    const query = text(batch.query, "batch.query");
    const response = object(batch.response, "batch.response");
    if (response.success !== true) fail(`batch ${batchId} must represent successful synthetic search results`);
    const web = array(object(response.data, "response.data").web, "response.data.web");
    const mapping = array(batch.mapping, "batch.mapping");
    if (mapping.length !== web.length) fail(`batch ${batchId} must map each result exactly once`);
    const mappedPositions = new Set<number>();

    for (const value of mapping) {
      const row = object(value, "mapping entry");
      const position = integer(row.position, "mapping.position", 1, web.length);
      if (mappedPositions.has(position)) fail(`batch ${batchId} repeats result position ${position}`);
      mappedPositions.add(position);
      const result = object(web[position - 1], `web[${position - 1}]`);
      if (result.position !== undefined && result.position !== position) fail(`batch ${batchId} result position does not match its order`);
      const sourceUrl = text(result.url, "result.url", 2048);
      let parsed: URL;
      try { parsed = new URL(sourceUrl); } catch { fail(`result URL is malformed: ${sourceUrl}`); }
      if (parsed.protocol !== "https:" || !parsed.hostname.endsWith(".example") || parsed.username || parsed.password || parsed.port || parsed.hash) fail("fixture URLs must use credential-free https://*.example URLs without ports or fragments");
      if (sourceUrls.has(parsed.href)) fail(`duplicate website URL ${parsed.href}`);
      sourceUrls.add(parsed.href);
      const name = text(result.title, "result.title", 160);
      const description = text(result.description, "result.description");
      const planet: WebsitePlanet = {
        id: identifier(row.planetId, "mapping.planetId"), kind: "planet", parentId: systemId,
        name, description, seed: integer(row.seed, "mapping.seed"),
        source: { url: parsed.href, title: name, description, provider: "firecrawl", operation: "search", query, position },
      };
      addEntity(planet);
      planets.push(planet);
    }
  }

  if (byId.get(rootId)?.kind !== "universe" || byId.get(rootId)?.parentId !== null) fail("rootId must identify the root universe");
  if (byId.get(initialSystemId)?.kind !== "system") fail("initialSystemId must identify a system");
  for (const entity of entities) {
    if (entity.kind === "universe") {
      if (entity.id !== rootId || entity.parentId !== null) fail("only the declared root may be a universe");
    } else if (entity.parentId === null || byId.get(entity.parentId)?.kind !== parentKind[entity.kind]) {
      fail(`invalid parent for ${entity.id}`);
    }
  }

  return { mode: "demo", rootId, initialSystemId, entities, planets };
}
