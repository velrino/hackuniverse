import type { NavigationTarget, UniverseCatalogDocument, UniverseEntity, UniverseGroup } from "../../../domain/types";

export type FirecrawlSearchInput = {
  mode: "demo" | "live";
  rootId: string;
  initialTarget?: NavigationTarget;
  groups: readonly UniverseGroup[];
  batches: readonly {
    id: string;
    systemId: string;
    query: string;
    response: unknown;
    mapping: readonly { planetId: string; seed: number; position: number }[];
  }[];
};

type InputRecord = Record<string, unknown>;
const controls = /[\u0000-\u001f\u007f-\u009f]/;
const sensitiveParameter = /^(?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|api[_-]?key|key|secret|client[_-]?secret|auth|authorization|credential|signature|sig|x-amz-.+|x-goog-.+)$/i;

function fail(message: string): never {
  throw new Error(`Invalid Firecrawl search input: ${message}`);
}

function object(value: unknown, field: string): InputRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(`${field} must be an object`);
  return value as InputRecord;
}

function array(value: unknown, field: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  return value;
}

function text(value: unknown, field: string, limit: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > limit || (!allowEmpty && !value.trim())) {
    fail(`${field} must be bounded text`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const id = text(value, field, 256);
  if (controls.test(id)) fail(`${field} must not contain control characters`);
  return id;
}

function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${field} must be an integer in range`);
  }
  return value;
}

function website(value: unknown): URL {
  const href = text(value, "result.url", 4096);
  if (controls.test(href)) fail("result.url must not contain control characters");
  let url: URL;
  try { url = new URL(href); } catch { fail("result.url must be an absolute HTTPS URL"); }
  if (url.protocol !== "https:" || url.username || url.password) fail("result.url must be credential-free HTTPS");
  // Inputs must already be safe canonical links. Reject recognizable credentials
  // rather than silently stripping parameters and changing a resource's identity.
  const fragments = new URLSearchParams(url.hash.slice(1));
  for (const parameters of [url.searchParams, fragments]) {
    for (const name of parameters.keys()) if (sensitiveParameter.test(name)) fail("result.url contains a credential or signature parameter");
  }
  return url;
}

/** Projects one supplier format; the caller validates the resulting canonical tree. */
export function normalizeFirecrawlSearch(input: FirecrawlSearchInput): UniverseCatalogDocument {
  object(input, "input");
  if (input.mode !== "demo" && input.mode !== "live") fail("mode must be demo or live");
  array(input.groups, "groups");
  array(input.batches, "batches");
  const entities: UniverseEntity[] = input.groups.map((group) => {
    object(group, "group");
    if (!["universe", "galaxy", "cloud", "system"].includes(group.kind)) fail("groups may contain only grouping entities");
    return {
      id: group.id, kind: group.kind, parentId: group.parentId,
      name: group.name, description: group.description, seed: group.seed,
    };
  });
  const systems = new Set(input.groups.filter((group) => group.kind === "system").map((group) => group.id));
  const entityIds = new Set(input.groups.map((group) => group.id));
  const batchIds = new Set<string>();
  const websiteUrls = new Set<string>();

  for (const batch of input.batches) {
    object(batch, "batch");
    const batchId = identifier(batch.id, "batch.id");
    if (batchIds.has(batchId)) fail("batch IDs must be unique");
    batchIds.add(batchId);
    const systemId = identifier(batch.systemId, "batch.systemId");
    if (!systems.has(systemId)) fail("batch destination must be a supplied system");
    const query = text(batch.query, "batch.query", 1000);
    const response = object(batch.response, "response");
    if (response.success !== true) fail("response.success must be true");
    const web = array(object(response.data, "response.data").web, "response.data.web");
    const mapping = array(batch.mapping, "batch.mapping");
    if (mapping.length !== web.length) fail("mapping must cover every web result exactly once");
    const positions = new Set<number>();

    // Mapping order is application-owned and is retained independently of ranking.
    for (const value of mapping) {
      const row = object(value, "mapping entry");
      const position = integer(row.position, "mapping.position", 1, web.length);
      if (positions.has(position)) fail("mapping positions must be unique");
      positions.add(position);
      const planetId = identifier(row.planetId, "mapping.planetId");
      if (entityIds.has(planetId)) fail("mapped entity IDs must be unique");
      entityIds.add(planetId);
      const seed = integer(row.seed, "mapping.seed", 0, 0xffffffff);
      const result = object(web[position - 1], "web result");
      if (result.position !== undefined && result.position !== position) fail("provider position must agree with result order");
      const url = website(result.url);
      if (websiteUrls.has(url.href)) fail("website URLs must be unique");
      websiteUrls.add(url.href);
      entities.push({
        id: planetId, kind: "planet", parentId: systemId,
        name: text(result.title, "result.title", 160),
        description: text(result.description, "result.description", 4000, true),
        seed, reference: { label: url.hostname, href: url.href }, tags: [query],
      });
    }
  }

  return {
    schemaVersion: 1, mode: input.mode, rootId: input.rootId,
    ...(input.initialTarget ? { initialTarget: { kind: input.initialTarget.kind, id: input.initialTarget.id } } : {}),
    entities,
  };
}
