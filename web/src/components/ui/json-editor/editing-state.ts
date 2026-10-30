import type { EditEvent } from "json-edit-react";

/** Submission can fail validation; only an explicit commit/cancel ends an inline draft. */
export function getEditingState(current: boolean, event: EditEvent["event"]): boolean {
  switch (event) {
    case "startEdit":
    case "startRename":
    case "startAdd":
      return true;
    case "commitEdit":
    case "commitRename":
    case "commitAdd":
    case "cancelEdit":
    case "cancelRename":
    case "cancelAdd":
      return false;
    default:
      return current;
  }
}
