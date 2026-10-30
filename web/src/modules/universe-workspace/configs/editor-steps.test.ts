import assert from "node:assert/strict";
import test from "node:test";
import { getEditorIssues, getEditorSteps } from "./editor-steps";

test("the wizard skips inapplicable type/location stages for edits and universes", () => {
  assert.deepEqual(getEditorSteps("planet", false), ["type", "details", "location", "review"]);
  assert.deepEqual(getEditorSteps("universe", false), ["type", "details", "review"]);
  assert.deepEqual(getEditorSteps("planet", true), ["details", "location", "review"]);
  assert.deepEqual(getEditorSteps("universe", true), ["details", "review"]);
});

test("final validation reports missing fields in stage order", () => {
  const draft = { kind: "planet" as const, name: "  ", description: "", href: "http://example.test" };
  assert.deepEqual(getEditorIssues(draft).map(({ step, field }) => ({ step, field })), [
    { step: "details", field: "name" },
    { step: "location", field: "href" },
  ]);
  assert.equal(getEditorIssues({ ...draft, name: "Astra" })[0]?.field, "href");
});

test("review checks HTTPS and userinfo, while empty websites and inactive fields are valid", () => {
  const draft = { kind: "planet" as const, name: "Astra", description: "" };
  for (const href of [undefined, "", "https://example.test/path", "HTTPS://example.test"]) assert.deepEqual(getEditorIssues({ ...draft, href }), []);
  const normalized = new URL(`https://example.test/${"界".repeat(500)}`).href;
  assert.ok(normalized.length > 4096);
  assert.deepEqual(getEditorIssues({ ...draft, href: normalized }), []);
  for (const href of ["not a URL", "http://example.test", "https://user:sample@example.test", "javascript:void(0)", "https://example.test/\n"]) {
    assert.equal(getEditorIssues({ ...draft, href })[0]?.field, "href");
  }
  assert.deepEqual(getEditorIssues({ ...draft, kind: "universe", href: "not active" }), []);
  assert.equal(getEditorIssues({ ...draft, name: "x".repeat(161) })[0]?.message, "nameTooLong");
});
