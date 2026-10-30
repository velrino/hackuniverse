/** Ordering and parent/child rules shared by parsing, editing and navigation UI. */
export const entityHierarchy = ["universe", "galaxy", "cloud", "system", "planet"] as const;
export type EntityKind = typeof entityHierarchy[number];
export function getParentKind(kind: EntityKind): EntityKind | null { return entityHierarchy[entityHierarchy.indexOf(kind) - 1] ?? null; }
export function getChildKind(kind: EntityKind): EntityKind | null { return entityHierarchy[entityHierarchy.indexOf(kind) + 1] ?? null; }
