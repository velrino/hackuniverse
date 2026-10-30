import { parseLocalWorkspace, workspaceDocument, workspaceLimits, WorkspaceValidationError, type LocalWorkspace } from "./workspace";

export type TransferValidationCode = "syntax" | "size" | "depth" | "shape" | "unsafe" | "conflict" | "limit";
export type WorkspaceImportMode = "merge" | "replace";
export const jsonTransferLimits = Object.freeze({ depth: 16, nodes: 50_000 });

export class TransferValidationError extends Error {
  constructor(public readonly code: TransferValidationCode) {
    super(`Invalid workspace JSON: ${code}`);
    this.name = "TransferValidationError";
  }
}

type JsonValue = null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };
const forbiddenKeys = new Set(["__proto__", "constructor", "prototype"]);
const encoder = new TextEncoder();

function fail(code: TransferValidationCode): never { throw new TransferValidationError(code); }

function checkBytes(text: string) {
  if (text.length > workspaceLimits.bytes || encoder.encode(text).length > workspaceLimits.bytes) fail("size");
}

/** Check nesting before JSON.parse can allocate an arbitrarily deep document. */
function checkRawDepth(text: string) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === "{" || character === "[") {
      if (++depth > jsonTransferLimits.depth) fail("depth");
    } else if (character === "}" || character === "]") {
      if (--depth < 0) fail("syntax");
    }
  }
}

/** Snapshot descriptors without invoking input getters, toJSON methods or coercion. */
function snapshotJson(value: unknown): JsonValue {
  let nodes = 0;
  let stringBytes = 0;
  const active = new WeakSet<object>();
  const countString = (text: string) => {
    if (text.length > workspaceLimits.bytes) fail("size");
    stringBytes += encoder.encode(text).length;
    if (stringBytes > workspaceLimits.bytes) fail("size");
  };
  const visit = (item: unknown, depth: number): JsonValue => {
    if (++nodes > jsonTransferLimits.nodes) fail("limit");
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") { if (!Number.isFinite(item)) fail("unsafe"); return item; }
    if (typeof item === "string") { countString(item); return item; }
    if (typeof item !== "object") fail("unsafe");
    if (depth > jsonTransferLimits.depth) fail("depth");
    if (active.has(item)) fail("unsafe");
    const array = Array.isArray(item);
    const prototype = Object.getPrototypeOf(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) fail("unsafe");
    const keys = Reflect.ownKeys(item);
    if (keys.length > jsonTransferLimits.nodes - nodes + 1) fail("limit");
    for (const key of keys) {
      if (typeof key !== "string" || forbiddenKeys.has(key)) fail("unsafe");
      if (!array) countString(key);
    }
    active.add(item);
    try {
      if (array) {
        const length = Object.getOwnPropertyDescriptor(item, "length")?.value;
        if (typeof length !== "number" || keys.length !== length + 1) fail("unsafe");
        const result: JsonValue[] = [];
        for (let index = 0; index < length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          if (!descriptor?.enumerable || !("value" in descriptor)) fail("unsafe");
          result.push(visit(descriptor.value, depth + 1));
        }
        return result;
      }
      const result: Record<string, JsonValue> = {};
      for (const key of keys as string[]) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        if (!descriptor?.enumerable || !("value" in descriptor)) fail("unsafe");
        result[key] = visit(descriptor.value, depth + 1);
      }
      return result;
    } finally { active.delete(item); }
  };
  try { return visit(value, 1); }
  catch (error) { if (error instanceof TransferValidationError) throw error; return fail("unsafe"); }
}

function fields(value: JsonValue | undefined, allowed: readonly string[]): Record<string, JsonValue> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("shape");
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail("shape");
  return value;
}

/** Transfer files contain documents, not the runtime's derived planets index or supplier metadata. */
function checkDocumentShape(value: JsonValue) {
  const root = fields(value, ["schemaVersion", "activeUniverseId", "universes"]);
  if (!Array.isArray(root.universes)) fail("shape");
  for (const universe of root.universes) {
    const catalog = fields(universe, ["schemaVersion", "mode", "rootId", "initialTarget", "entities"]);
    if (catalog.initialTarget !== undefined) fields(catalog.initialTarget, ["kind", "id"]);
    if (!Array.isArray(catalog.entities)) fail("shape");
    for (const candidate of catalog.entities) {
      const entity = fields(candidate, ["id", "kind", "parentId", "name", "description", "seed", "type", "star", "reference", "tags"]);
      if (entity.star !== undefined) {
        const star = fields(entity.star, ["name", "description", "spectralType", "temperatureK", "radiusKm", "ageBillionYears", "reference"]);
        if (star.reference !== undefined) checkReference(star.reference);
      }
      if (entity.reference !== undefined) checkReference(entity.reference);
      if (entity.kind !== "planet" && (entity.reference !== undefined || entity.tags !== undefined)) fail("shape");
    }
  }
}

function checkReference(value: JsonValue) {
  fields(value, ["label", "href"]);
}

function canonicalWorkspace(value: unknown): LocalWorkspace {
  try { return parseLocalWorkspace(value); }
  catch (error) { return fail(error instanceof WorkspaceValidationError && error.code === "limit" ? "limit" : "shape"); }
}

function compactWorkspace(workspace: LocalWorkspace): string {
  const text = JSON.stringify(workspaceDocument(workspace));
  checkBytes(text);
  return text;
}

function safeSnapshot(value: unknown): JsonValue {
  const snapshot = snapshotJson(value);
  checkBytes(JSON.stringify(snapshot));
  return snapshot;
}

/** Structural gate for editable drafts; canonical IDs and parent rules may be incomplete. */
export function assertTransferJsonStructure(value: unknown): void {
  safeSnapshot(value);
}

/** Parse a bounded JSON fragment before an editor traverses or renders it. */
export function parseTransferJson(text: string): unknown {
  if (typeof text !== "string") fail("syntax");
  checkBytes(text);
  checkRawDepth(text);
  let value: unknown;
  try { value = JSON.parse(text); }
  catch { return fail("syntax"); }
  return safeSnapshot(value);
}

/** Validate a JSON editor's value and return a separate, frozen canonical workspace. */
export function validateWorkspaceJson(value: unknown): LocalWorkspace {
  const snapshot = safeSnapshot(value);
  checkDocumentShape(snapshot);
  const workspace = canonicalWorkspace(snapshot);
  compactWorkspace(workspace);
  return workspace;
}

/** Only a bounded canonical workspace envelope is accepted; no provider formats are inferred. */
export function parseWorkspaceJson(text: string): LocalWorkspace {
  return validateWorkspaceJson(parseTransferJson(text));
}

/** Readable downloads stay re-importable even when indentation exceeds the byte cap. */
export function exportWorkspaceJson(workspace: LocalWorkspace): string {
  const canonical = validateWorkspaceJson(workspaceDocument(canonicalWorkspace(workspace)));
  const compact = compactWorkspace(canonical);
  const pretty = JSON.stringify(workspaceDocument(canonical), null, 2);
  return pretty.length <= workspaceLimits.bytes && encoder.encode(pretty).length <= workspaceLimits.bytes ? pretty : compact;
}

/** Merge never overwrites an ID. Replacing the workspace is an explicit caller decision. */
export function prepareWorkspaceImport(current: LocalWorkspace, incoming: LocalWorkspace, mode: WorkspaceImportMode = "merge"): LocalWorkspace {
  if (mode !== "merge" && mode !== "replace") fail("shape");
  const imported = validateWorkspaceJson(workspaceDocument(canonicalWorkspace(incoming)));
  if (mode === "replace") return imported;
  const existing = validateWorkspaceJson(workspaceDocument(canonicalWorkspace(current)));
  const ids = new Set(existing.universes.flatMap((universe) => universe.entities.map((entity) => entity.id)));
  for (const universe of imported.universes) for (const entity of universe.entities) if (ids.has(entity.id)) fail("conflict");
  return validateWorkspaceJson({
    schemaVersion: 1,
    activeUniverseId: existing.activeUniverseId ?? imported.activeUniverseId,
    universes: [...workspaceDocument(existing).universes, ...workspaceDocument(imported).universes],
  });
}
