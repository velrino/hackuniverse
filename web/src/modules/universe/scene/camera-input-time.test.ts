import assert from "node:assert/strict";
import test from "node:test";
import { isFreshCameraInput } from "./camera-input-time";

test("fresh physical packets include the 180 ms boundary while backlogged packets cannot restart audio", () => {
  assert.equal(isFreshCameraInput(1000, 1000), true);
  assert.equal(isFreshCameraInput(1000, 1179.99), true);
  assert.equal(isFreshCameraInput(1000, 1180), true);
  assert.equal(isFreshCameraInput(1000, 1180.01), false);
  assert.equal(isFreshCameraInput(280.9, 2285.4), false, "a real trusted Chromium wheel packet can already be two seconds old");
});

test("invalid or future event clocks fail closed without rejecting valid later input", () => {
  for (const invalid of [NaN, Infinity, -Infinity, -1]) {
    assert.equal(isFreshCameraInput(invalid, 1000), false);
    assert.equal(isFreshCameraInput(1000, invalid), false);
  }
  assert.equal(isFreshCameraInput(1001, 1000), false);
  assert.equal(isFreshCameraInput(0, 0), true);
  assert.equal(isFreshCameraInput(0, 180), true);
  assert.equal(isFreshCameraInput(1200, 1201), true);
});
