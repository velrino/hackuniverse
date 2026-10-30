import assert from "node:assert/strict";
import test from "node:test";
import { createOrbitIntentGate } from "./orbit-intent";

test("a real angular drag starts feedback and repeats only while movement continues", () => {
  const accept = createOrbitIntentGate();
  assert.equal(accept({ now: 0, azimuth: 0, polar: 1, manual: false }), false);
  assert.equal(accept({ now: 16, azimuth: 0, polar: 1, manual: true }), false);
  assert.equal(accept({ now: 32, azimuth: 0.01, polar: 1, manual: true }), true);
  for (let now = 48; now < 2282; now += 16) assert.equal(accept({ now, azimuth: now * 0.001, polar: 1, manual: true }), false);
  assert.equal(accept({ now: 2290, azimuth: 2.29, polar: 1, manual: true }), true);
  assert.equal(accept({ now: 4600, azimuth: 2.29, polar: 1, manual: true }), false, "a held pointer without rotation does not make sound");
  assert.equal(accept({ now: 4616, azimuth: 2.30, polar: 1, manual: true }), true);
  assert.equal(accept({ now: 4632, azimuth: 2.30, polar: 1, manual: false }), false);
  assert.equal(accept({ now: 5000, azimuth: 2.30, polar: 1, manual: false }), false);
});

test("automatic motion, pinch/tween gates and invalid samples cannot leak a manual cue", () => {
  const accept = createOrbitIntentGate();
  for (let now = 0; now < 4000; now += 16) assert.equal(accept({ now, azimuth: now * 0.01, polar: 1, manual: false }), false);
  assert.equal(accept({ now: NaN, azimuth: 0, polar: 1, manual: true }), false);
  assert.equal(accept({ now: 4100, azimuth: 0, polar: Infinity, manual: true }), false);
  assert.equal(accept({ now: 4200, azimuth: 0, polar: 1, manual: true }), false);
  assert.equal(accept({ now: 4216, azimuth: 0, polar: 1.01, manual: true }), true);
});

test("subpixel rotation accumulates and crossing the azimuth seam stays continuous", () => {
  const accept = createOrbitIntentGate();
  accept({ now: 0, azimuth: Math.PI - 0.0001, polar: 1, manual: false });
  assert.equal(accept({ now: 16, azimuth: -Math.PI + 0.0001, polar: 1, manual: true }), false);
  for (let index = 1; index < 8; index++) assert.equal(accept({ now: 16 + index * 16, azimuth: -Math.PI + 0.0001 + index * 0.0001, polar: 1, manual: true }), false);
  assert.equal(accept({ now: 160, azimuth: -Math.PI + 0.0011, polar: 1, manual: true }), true);
});

test("stationary-pointer damping stays silent without resetting the current drag cadence", () => {
  const accept = createOrbitIntentGate();
  accept({ now: 0, azimuth: 0, polar: 1, manual: false });
  assert.equal(accept({ now: 16, azimuth: 0.01, polar: 1, manual: true }), true);
  assert.equal(accept({ now: 300, azimuth: 0.1, polar: 1, manual: true, inputRecent: false }), false);
  assert.equal(accept({ now: 600, azimuth: 0.12, polar: 1, manual: true, inputRecent: true }), false);
  assert.equal(accept({ now: 1700, azimuth: 0.15, polar: 1, manual: true, inputRecent: false }), false);
  assert.equal(accept({ now: 2416, azimuth: 0.16, polar: 1, manual: true, inputRecent: true }), true);
});
