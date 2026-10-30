import assert from "node:assert/strict";
import test from "node:test";
import { isAudioUnlockGesture } from "./gesture";

test("activation uses mouse press and touch/pen release without double-triggering", () => {
  for (const pointerType of ["mouse", "touch", "pen"]) {
    const down = { isTrusted: true, type: "pointerdown", button: 0, pointerType };
    const up = { ...down, type: "pointerup" };
    assert.equal(isAudioUnlockGesture(down, false), pointerType === "mouse");
    assert.equal(isAudioUnlockGesture(up, false), pointerType !== "mouse");
  }
});

test("muting, silent controls, untrusted events and passive keys never unlock audio", () => {
  const mouse = { isTrusted: true, type: "pointerdown", button: 0, pointerType: "mouse" };
  assert.equal(isAudioUnlockGesture(mouse, true), false);
  assert.equal(isAudioUnlockGesture(mouse, false, false), false);
  assert.equal(isAudioUnlockGesture(mouse, false, true), true);
  assert.equal(isAudioUnlockGesture({ ...mouse, isTrusted: false }, false), false);
  assert.equal(isAudioUnlockGesture({ ...mouse, button: 2 }, false), false);
  const key = { isTrusted: true, type: "keydown", key: "Enter" };
  assert.equal(isAudioUnlockGesture(key, false), true);
  assert.equal(isAudioUnlockGesture(key, false, false), false);
  assert.equal(isAudioUnlockGesture(key, true), false);
  for (const passive of ["Escape", "Shift", "Control", "Alt", "Meta", "CapsLock", "NumLock", "ScrollLock", "PrintScreen"]) {
    assert.equal(isAudioUnlockGesture({ ...key, key: passive }, false), false);
  }
  assert.equal(isAudioUnlockGesture({ ...key, repeat: true }, false), false);
  assert.equal(isAudioUnlockGesture({ ...key, ctrlKey: true }, false), false);
  assert.equal(isAudioUnlockGesture({ ...key, type: "keyup" }, false), false);
});
