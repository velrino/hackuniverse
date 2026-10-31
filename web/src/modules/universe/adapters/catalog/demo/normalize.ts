import { parseUniverseCatalog } from "../../../domain/parse-catalog";
import type { EntityKind, UniverseCatalogDocument } from "../../../domain/types";

type InputRecord = Record<string, unknown>;
const children = {
  universe: { field: "galaxies", kind: "galaxy" },
  galaxy: { field: "clouds", kind: "cloud" },
  cloud: { field: "systems", kind: "system" },
  system: { field: "planets", kind: "planet" },
} as const;
const childFields = ["galaxies", "clouds", "systems", "planets"] as const;

function invalid(message: string): never {
  throw new Error(`Invalid demo authoring catalog: ${message}`);
}

function record(value: unknown, field: string): InputRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(`${field} must be an object`);
  return value as InputRecord;
}

/** Organized demo authoring is an adapter input, never a runtime/export schema. */
export function normalizeDemoCatalog(input: unknown): UniverseCatalogDocument {
  const source = record(input, "document");
  const metadata = record(source.catalog, "catalog");
  if (metadata.schemaVersion !== 1 || metadata.mode !== "demo") invalid("catalog must select schemaVersion 1 and demo mode");
  const root = record(source.universe, "universe");
  const projected: unknown[] = [];

  function visit(value: unknown, kind: EntityKind, parentId: unknown) {
    const node = record(value, `${kind} node`);
    if (Object.hasOwn(node, "kind") || Object.hasOwn(node, "parentId")) invalid("node kind and parentId must be derived from the authored tree");
    const branch = kind === "planet" ? null : children[kind];
    for (const field of childFields) {
      if (Object.hasOwn(node, field) && field !== branch?.field) invalid(`${kind} node has an unexpected child collection`);
    }
    if (kind !== "system" && node.star !== undefined) invalid("star metadata belongs only to systems");
    if (kind !== "planet" && (node.reference !== undefined || node.tags !== undefined)) invalid("reference and tags belong only to planets");
    projected.push({
      id: node.id, kind, parentId, name: node.name, description: node.description, seed: node.seed,
      ...(node.type === undefined ? {} : { type: node.type }),
      ...(kind === "system" && node.star !== undefined ? { star: node.star } : {}),
      ...(kind === "planet" && node.reference !== undefined ? { reference: node.reference } : {}),
      ...(kind === "planet" && node.tags !== undefined ? { tags: node.tags } : {}),
    });
    if (!branch) return;
    const nested = node[branch.field];
    if (!Array.isArray(nested)) invalid(`${kind}.${branch.field} must be an array`);
    for (const child of nested) visit(child, branch.kind, node.id);
  }

  visit(root, "universe", null);
  // The shared domain parser validates IDs, relationships and values, owns all
  // nested records and drops any noncanonical metadata. Provenance stays here.
  const { schemaVersion, mode, rootId, initialTarget, entities } = parseUniverseCatalog({
    schemaVersion: metadata.schemaVersion, mode: metadata.mode, rootId: root.id,
    ...(metadata.initialTarget === undefined ? {} : { initialTarget: metadata.initialTarget }),
    entities: projected,
  });
  return { schemaVersion, mode, rootId, initialTarget, entities };
}
