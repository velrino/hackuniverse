import assert from "node:assert/strict";
import test from "node:test";
import { isManualOrbitSample } from "./orbit-intent";

test("every physical angular change renews feedback without a heartbeat or accumulated threshold", () => {
  for (let sample = 0; sample < 200; sample++) {
    const azimuth = sample * 0.00001;
    assert.equal(isManualOrbitSample({ before: { azimuth, polar: 1 }, after: { azimuth: azimuth + 0.00001, polar: 1 }, manual: true, inputMoved: true }), true);
  }
  assert.equal(isManualOrbitSample({ before: { azimuth: 0, polar: 1 }, after: { azimuth: 0, polar: 1 }, manual: true, inputMoved: true }), false);
});

test("automatic travel, released or stationary pointers and invalid angles never renew sound", () => {
  const sample = { before: { azimuth: 0, polar: 1 }, after: { azimuth: 0.1, polar: 1 }, manual: true, inputMoved: true };
  assert.equal(isManualOrbitSample({ ...sample, manual: false }), false);
  assert.equal(isManualOrbitSample({ ...sample, inputMoved: false }), false);
  for (const value of [NaN, Infinity, -Infinity]) {
    assert.equal(isManualOrbitSample({ ...sample, before: { azimuth: value, polar: 1 } }), false);
    assert.equal(isManualOrbitSample({ ...sample, after: { azimuth: 0.1, polar: value } }), false);
  }
});

test("azimuth wrapping remains a real small rotation and whole turns are not false movement", () => {
  assert.equal(isManualOrbitSample({ before: { azimuth: Math.PI - 0.0001, polar: 1 }, after: { azimuth: -Math.PI + 0.0001, polar: 1 }, manual: true, inputMoved: true }), true);
  assert.equal(isManualOrbitSample({ before: { azimuth: 0, polar: 1 }, after: { azimuth: Math.PI * 2, polar: 1 }, manual: true, inputMoved: true }), false);
});
