import assert from "node:assert/strict";
import test from "node:test";
import { audioToggleCue, audioToggleState } from "./ui-cue";

test("switches and pressed buttons expose their actual checked semantics", () => {
  const state = { role: "switch", pressed: null, checked: "false", destination: false, readOnly: false };
  assert.equal(audioToggleState(state), "off");
  assert.equal(audioToggleState({ ...state, checked: "true" }), "on");
  assert.equal(audioToggleState({ ...state, role: "button", pressed: "true" }), "on");
  assert.equal(audioToggleState({ ...state, readOnly: true }), null);
  assert.equal(audioToggleState({ ...state, role: "button", pressed: "true", destination: true }), null);
  assert.equal(audioToggleState({ ...state, checked: "mixed" }), null);
});

test("toggle cues require a committed change, including a setting that closes its dialog", () => {
  assert.equal(audioToggleCue("off", "on", true), "toggle-on");
  assert.equal(audioToggleCue("on", "off", true), "toggle-off");
  assert.equal(audioToggleCue("on", "on", true), null);
  assert.equal(audioToggleCue("off", null, true), null);
  assert.equal(audioToggleCue("off", "off", false), "toggle-on");
});
