import assert from "node:assert/strict";
import test from "node:test";
import { createZoomIntentGate } from "./zoom-intent";

test("one continuous zoom gesture produces one cue, while a reversal and later gesture remain observable", () => {
  const accept = createZoomIntentGate();
  assert.equal(accept("in", 0), true);
  for (let now = 16; now <= 1600; now += 16) assert.equal(accept("in", now), false);
  assert.equal(accept("out", 1616), true);
  assert.equal(accept("out", 1632), false);
  assert.equal(accept("out", 1872), true);
});

test("separate scene instances do not share gestures and an invalid timestamp cannot poison the gate", () => {
  const first = createZoomIntentGate();
  const second = createZoomIntentGate();
  assert.equal(first("in", 100), true);
  assert.equal(first("out", NaN), false);
  assert.equal(first("in", 110), false);
  assert.equal(second("in", 110), true);
  assert.equal(first("in", 0), true);
});
