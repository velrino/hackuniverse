import type { CatalogReference, EntityKind, NavigationTarget, SystemStar, UniverseCatalog, UniverseEntity, UniversePlanet } from "./types";

type InputRecord = Record<string, unknown>;
const kinds = new Set<EntityKind>(["universe", "galaxy", "cloud", "system", "planet"]);
const controls = /[\u0000-\u001f\u007f-\u009f]/u;
const parentKinds: Record<Exclude<EntityKind, "universe">, EntityKind> = {
  galaxy: "universe", cloud: "galaxy", system: "cloud", planet: "system",
};

function invalid(message: string): never {
  throw new Error(`Invalid universe catalog: ${message}`);
}

function record(value: unknown, field: string): InputRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${field} must be an object`);
  return value as InputRecord;
}

function list(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(`${field} must be an array`);
  return value;
}

function text(value: unknown, field: string, limit: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > limit || !allowEmpty && !value.trim()) {
    invalid(`${field} must be ${allowEmpty ? "text" : "nonempty text"} with at most ${limit} characters`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field, 256);
  if (controls.test(result)) invalid(`${field} must not contain control characters`);
  return result;
}

function entityKind(value: unknown, field: string): EntityKind {
  if (typeof value !== "string" || !kinds.has(value as EntityKind)) invalid(`${field} is unsupported`);
  return value as EntityKind;
}

function seed(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    invalid(`${field} must be an unsigned 32-bit integer`);
  }
  return value;
}

function demoType(value: unknown, field: string): "demo" | undefined {
  if (value !== undefined && value !== "demo") invalid(`${field} must be demo when supplied`);
  return value;
}

function reference(value: unknown, field: string): CatalogReference {
  const input = record(value, field);
  const label = text(input.label, `${field}.label`, 160);
  if (input.href === undefined) return Object.freeze({ label });
  if (typeof input.href !== "string" || !input.href.trim() || controls.test(input.href)) {
    invalid(`${field}.href must be a credential-free HTTPS URL without control characters`);
  }
  let url: URL;
  try { url = new URL(input.href); }
  catch { invalid(`${field}.href must be a valid HTTPS URL`); }
  if (url.protocol !== "https:" || url.username || url.password) {
    invalid(`${field}.href must be a credential-free HTTPS URL`);
  }
  return Object.freeze({ label, href: url.href });
}

function positiveNumber(value: unknown, field: string, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > maximum) {
    invalid(`${field} must be a finite positive number within its supported bound`);
  }
  return value;
}

function systemStar(value: unknown, field: string): SystemStar {
  const input = record(value, field);
  return Object.freeze({
    name: text(input.name, `${field}.name`, 160),
    description: text(input.description, `${field}.description`, 4000, true),
    ...(input.spectralType === undefined ? {} : { spectralType: text(input.spectralType, `${field}.spectralType`, 80) }),
    ...(input.temperatureK === undefined ? {} : { temperatureK: positiveNumber(input.temperatureK, `${field}.temperatureK`, 1_000_000) }),
    ...(input.radiusKm === undefined ? {} : { radiusKm: positiveNumber(input.radiusKm, `${field}.radiusKm`, 10_000_000_000) }),
    ...(input.ageBillionYears === undefined ? {} : { ageBillionYears: positiveNumber(input.ageBillionYears, `${field}.ageBillionYears`, 100) }),
    ...(input.reference === undefined ? {} : { reference: reference(input.reference, `${field}.reference`) }),
  });
}

function entity(value: unknown, index: number): UniverseEntity {
  const field = `entities[${index}]`;
  const input = record(value, field);
  const kind = entityKind(input.kind, `${field}.kind`);
  const type = demoType(input.type, `${field}.type`);
  if (input.star !== undefined && kind !== "system") invalid(`${field}.star is only supported on systems`);
  const common = {
    id: identifier(input.id, `${field}.id`),
    name: text(input.name, `${field}.name`, 160),
    description: text(input.description, `${field}.description`, 4000, true),
    seed: seed(input.seed, `${field}.seed`),
    ...(type === undefined ? {} : { type }),
  };
  if (kind === "planet") {
    let tags: readonly string[] | undefined;
    if (input.tags !== undefined) {
      const values = list(input.tags, `${field}.tags`);
      if (values.length > 32) invalid(`${field}.tags must contain at most 32 entries`);
      tags = Object.freeze(values.map((tag, position) => text(tag, `${field}.tags[${position}]`, 1000, true)));
    }
    return Object.freeze({
      ...common, kind, parentId: identifier(input.parentId, `${field}.parentId`),
      ...(input.reference === undefined ? {} : { reference: reference(input.reference, `${field}.reference`) }),
      ...(tags === undefined ? {} : { tags }),
    });
  }
  if (kind === "system") return Object.freeze({
    ...common, kind, parentId: input.parentId === null ? null : identifier(input.parentId, `${field}.parentId`),
    ...(input.star === undefined ? {} : { star: systemStar(input.star, `${field}.star`) }),
  });
  return Object.freeze({ ...common, kind, parentId: input.parentId === null ? null : identifier(input.parentId, `${field}.parentId`) });
}

/** Project canonical fields, omit unknown metadata, and freeze the owned result. */
export function parseUniverseCatalog(input: unknown): UniverseCatalog {
  const document = record(input, "document");
  if (document.schemaVersion !== 1) invalid("schemaVersion must be 1");
  const mode = document.mode;
  if (mode !== "demo" && mode !== "live") invalid("mode must be demo or live");
  const rootId = identifier(document.rootId, "rootId");
  const entities = list(document.entities, "entities").map(entity);
  const byId = new Map<string, UniverseEntity>();
  for (const item of entities) {
    if (byId.has(item.id)) invalid("entity IDs must be unique");
    byId.set(item.id, item);
  }
  const root = byId.get(rootId);
  if (root?.kind !== "universe" || root.parentId !== null || entities.filter((item) => item.kind === "universe").length !== 1) {
    invalid("rootId must identify the only root universe, with no parent");
  }
  for (const item of entities) {
    if (item.kind !== "universe" && (item.parentId === null || byId.get(item.parentId)?.kind !== parentKinds[item.kind])) {
      invalid("each entity must resolve to its required parent kind");
    }
  }

  let initialTarget: NavigationTarget;
  if (document.initialTarget === undefined) initialTarget = Object.freeze({ kind: "universe", id: rootId });
  else {
    const target = record(document.initialTarget, "initialTarget");
    const id = identifier(target.id, "initialTarget.id");
    const kind = entityKind(target.kind, "initialTarget.kind");
    if (byId.get(id)?.kind !== kind) invalid("initialTarget must resolve to an entity of the declared kind");
    initialTarget = Object.freeze({ kind, id });
  }
  const planets = Object.freeze(entities.filter((item): item is UniversePlanet => item.kind === "planet"));
  return Object.freeze({ schemaVersion: 1, mode, rootId, initialTarget, entities: Object.freeze(entities), planets });
}
