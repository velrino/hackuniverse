import assert from "node:assert/strict";
import test from "node:test";
import { createZoomIntentGate } from "./zoom-intent";

test("continuous manual zoom emits a bounded heartbeat for the full gesture", () => {
  const accept = createZoomIntentGate();
  const cues: number[] = [];
  for (let now = 0; now <= 3200; now += 16) if (accept("in", now)) cues.push(now);
  assert.deepEqual(cues, [0, 512, 1024, 1536, 2048, 2560, 3072]);
  assert.equal(accept("in", 3450), true, "a separate gesture starts immediately after an idle gap");
});

test("a reversal survives jitter rejection and the next accepted input uses the latest direction", () => {
  const accept = createZoomIntentGate();
  assert.equal(accept("in", 0), true);
  assert.equal(accept("out", 15), false);
  assert.equal(accept("out", 110), true);
  assert.equal(accept("in", 125), false);
  assert.equal(accept("in", 230), true);
  for (let now = 245; now < 730; now += 15) assert.equal(accept("in", now), false);
  assert.equal(accept("in", 735), true);
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
