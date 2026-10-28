import assert from "node:assert/strict";
import test from "node:test";
import { createTourDolly, type TourDolly } from "./tour-motion";
import { orbitalAngle, orbitalSpeed, systemOrbit } from "./layout";

function motion(from: number, to: number, options = {}) {
  const result = createTourDolly(from, to, options);
  assert.ok(result);
  return result;
}
const near = (actual: number, expected: number, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const velocity = (dolly: TourDolly, time: number, step = 0.1) =>
  (Math.log(dolly.sample(time + step).distance) - Math.log(dolly.sample(time).distance)) * 1000 / step;

test("reaches exact endpoints with normalized progress", () => {
  const dolly = motion(7, 250);
  assert.ok(Number.isFinite(dolly.duration) && dolly.duration > 0);
  assert.deepEqual(dolly.sample(0), { distance: 7, progress: 0 });
  assert.deepEqual(dolly.sample(dolly.duration), { distance: 250, progress: 1 });
  near(dolly.sample(dolly.duration / 2).progress, 0.5);
});

test("distance stays bounded and monotonic with every ramp combination", () => {
  for (const options of [{}, { start: true }, { end: true }, { start: true, end: true }]) {
    const dolly = motion(2, 900, options);
    let previous = 2;
    for (let index = 0; index <= 20; index++) {
      const sample = dolly.sample(dolly.duration * index / 20);
      assert.ok(sample.distance >= previous && sample.distance <= 900);
      assert.ok(sample.progress >= 0 && sample.progress <= 1);
      previous = sample.distance;
    }
  }
});

test("clamps negative, nonfinite and completed sample times", () => {
  const dolly = motion(3, 30);
  for (const time of [-10, -Infinity, NaN]) assert.deepEqual(dolly.sample(time), dolly.sample(0));
  for (const time of [dolly.duration + 1, Infinity]) assert.deepEqual(dolly.sample(time), dolly.sample(dolly.duration));
});

test("intermediate stages maintain nonzero constant log-distance velocity", () => {
  const dolly = motion(10, 1000);
  for (const fraction of [0, 0.25, 0.5, 0.9]) near(velocity(dolly, dolly.duration * fraction), 0.9);
  near(velocity(dolly, dolly.duration - 0.1), 0.9);
});

test("similarity remaps preserve motion and velocity across stage boundaries", () => {
  const first = motion(10, 100, { start: true });
  const reference = motion(100, 1000);
  for (const scale of [0.03, 0.193, 0.562, 2.1]) {
    const next = motion(100 * scale, 1000 * scale);
    near(next.duration, reference.duration);
    for (const fraction of [0, 0.3, 0.75, 1]) near(next.sample(next.duration * fraction).distance / scale, reference.sample(reference.duration * fraction).distance);
    near(velocity(first, first.duration - 0.1), velocity(next, 0));
  }
});

test("only the first stage accelerates from rest", () => {
  const first = motion(10, 100, { start: true });
  assert.ok(velocity(first, 0) < 0.001);
  near(velocity(first, 350), 0.9);
  near(velocity(first, first.duration - 0.1), 0.9);
  near(first.duration - motion(10, 100).duration, 175);
});

test("only the final stage decelerates to rest", () => {
  const last = motion(10, 100, { end: true });
  near(velocity(last, 0), 0.9);
  near(velocity(last, last.duration - 450), 0.9, 0.001);
  assert.ok(velocity(last, last.duration - 0.1) < 0.001);
  near(last.duration - motion(10, 100).duration, 225);
});

test("very short spans shorten ramps without overshoot or a stopped intermediate join", () => {
  const first = motion(1, 1.0001, { start: true });
  const both = motion(1, 1.0001, { start: true, end: true });
  assert.ok(first.duration < 350 && both.duration < 800);
  const step = first.duration / 10000;
  near(velocity(first, first.duration - step, step), 0.9, 0.001);
  assert.ok(both.sample(both.duration / 2).distance > 1);
  assert.deepEqual(both.sample(both.duration), { distance: 1.0001, progress: 1 });
});

test("rejects nonoutward, nonpositive and nonfinite endpoints", () => {
  for (const [from, to] of [[0, 1], [-1, 2], [2, 2], [3, 2], [1, 0], [NaN, 2], [1, NaN], [Infinity, 2], [1, Infinity]]) assert.equal(createTourDolly(from, to), null);
});

test("handles finite endpoints whose direct ratio overflows", () => {
  const dolly = motion(1e-250, 1e250, { start: true, end: true });
  assert.ok(Number.isFinite(dolly.duration));
  const middle = dolly.sample(dolly.duration / 2).distance;
  assert.ok(Number.isFinite(middle) && middle > 1e-250 && middle < 1e250);
});

test("shared orbital speeds are fifty percent above the original anchors", () => {
  for (const orbit of [9, 33, 108]) near(orbitalSpeed(orbit) / (0.06 * Math.pow(9 / orbit, 1.5)), 1.5);
});

test("main integration and previews retain the same orbital phase", () => {
  for (const index of [0, 4, 19]) {
    let elapsed = 13.7;
    let angle = orbitalAngle(index, elapsed);
    for (const delta of [0.016, 0.033, 0.05, 0.008, 0.04]) { elapsed += delta; angle += delta * orbitalSpeed(systemOrbit(index)); }
    near(angle, orbitalAngle(index, elapsed));
  }
});
