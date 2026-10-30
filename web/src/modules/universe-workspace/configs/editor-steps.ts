import type { EntityKind } from "../../universe/domain";
import type { EntityDraft } from "../domain";

export type EditorStep = "type" | "details" | "location" | "review";
export type EditorIssue = { step: "details" | "location"; field: "name" | "href"; message: "nameRequired" | "nameTooLong" | "invalidWebsite" };

export function getEditorSteps(kind: EntityKind, editing: boolean): EditorStep[] {
  return [...(editing ? [] : ["type" as const]), "details", ...(kind === "universe" ? [] : ["location" as const]), "review"];
}

/** Field validation runs only when the user confirms the final Create/Save action. */
export function getEditorIssues(draft: EntityDraft): EditorIssue[] {
  const issues: EditorIssue[] = [];
  if (!draft.name.trim()) issues.push({ step: "details", field: "name", message: "nameRequired" });
  else if (draft.name.length > 160) issues.push({ step: "details", field: "name", message: "nameTooLong" });
  if (draft.kind === "planet" && draft.href?.trim()) {
    // Canonical URL serialization can expand short Unicode input beyond the field's input limit.
    let valid = !/[\u0000-\u001f\u007f-\u009f]/u.test(draft.href);
    try { const url = new URL(draft.href.trim()); valid = valid && url.protocol === "https:" && !url.username && !url.password; }
    catch { valid = false; }
    if (!valid) issues.push({ step: "location", field: "href", message: "invalidWebsite" });
  }
  return issues;
}
