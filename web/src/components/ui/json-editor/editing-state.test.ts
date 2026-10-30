import assert from "node:assert/strict";
import test from "node:test";
import { getEditingState } from "./editing-state";

test("uncommitted inline drafts remain pending through submission and rejected validation", () => {
  let editing = getEditingState(false, "startEdit");
  assert.equal(editing, true);
  editing = getEditingState(editing, "submitEdit");
  editing = getEditingState(editing, "updateError");
  assert.equal(editing, true);
  assert.equal(getEditingState(editing, "cancelEdit"), false);
});

test("add and rename sessions finish only after committing or cancelling", () => {
  for (const [start, submit, commit, cancel] of [
    ["startAdd", "submitAdd", "commitAdd", "cancelAdd"],
    ["startRename", "submitRename", "commitRename", "cancelRename"],
    ["startEdit", "submitEdit", "commitEdit", "cancelEdit"],
  ] as const) {
    assert.equal(getEditingState(false, start), true);
    assert.equal(getEditingState(true, submit), true);
    assert.equal(getEditingState(true, commit), false);
    assert.equal(getEditingState(true, cancel), false);
  }
});

test("instant actions and delayed settlement cannot clear another active draft", () => {
  for (const event of ["delete", "move", "updateSuccess", "updateError"] as const) {
    assert.equal(getEditingState(true, event), true);
    assert.equal(getEditingState(false, event), false);
  }
});
