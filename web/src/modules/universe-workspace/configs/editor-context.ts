import { getChildKind, type EntityKind, type NavigationTarget, type UniverseCatalog } from "../../universe/domain";

/** Suggestions follow only the active catalog's current branch, never an arbitrary sibling. */
export function getEditorParentSuggestions(catalog?: UniverseCatalog, target?: NavigationTarget): Partial<Record<EntityKind, string>> {
  if (!catalog || !target) return {};
  const entities = new Map(catalog.entities.map((entity) => [entity.id, entity]));
  let current = entities.get(target.id);
  if (current?.kind !== target.kind) return {};
  const suggestions: Partial<Record<EntityKind, string>> = {};
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    const child = getChildKind(current.kind);
    if (child) suggestions[child] = current.id;
    current = current.parentId ? entities.get(current.parentId) : undefined;
  }
  return suggestions;
}
