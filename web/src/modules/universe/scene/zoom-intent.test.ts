import assert from "node:assert/strict";
import test from "node:test";
import { isManualZoomSample } from "./zoom-intent";

test("each real wheel or pinch distance change renews sound, including immediate reversals", () => {
  for (const [before, after] of [[100, 99], [99, 98], [98, 99], [99, 100], [0.01, 0.009]]) {
    assert.equal(isManualZoomSample(before, after, true), true);
  }
});

test("limits, zero movement and automatic camera changes cannot create manual zoom sound", () => {
  assert.equal(isManualZoomSample(100, 100, true), false);
  assert.equal(isManualZoomSample(100, 90, false), false);
  assert.equal(isManualZoomSample(100, 100 + 1e-12, true), false);
});

test("invalid optical distances are rejected without state that could affect a later sample", () => {
  for (const value of [0, -1, NaN, Infinity, -Infinity]) {
    assert.equal(isManualZoomSample(value, 100, true), false);
    assert.equal(isManualZoomSample(100, value, true), false);
  }
  assert.equal(isManualZoomSample(100, 90, true), true);
});
