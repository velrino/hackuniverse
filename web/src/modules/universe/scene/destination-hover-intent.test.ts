import assert from "node:assert/strict";
import test from "node:test";
import { createDestinationHoverIntent } from "./destination-hover-intent";

test("pointer entry and destination switches emit once while stationary animated destinations stay quiet", () => {
  const changes: (string | null)[] = [];
  const hover = createDestinationHoverIntent((id) => changes.push(id));
  hover.move(10, 20, true); hover.target("earth", true);
  for (let frame = 0; frame < 100; frame++) hover.target("earth", true);
  hover.target("neptune", true);
  hover.move(10, 20, true); hover.target("neptune", true);
  assert.deepEqual(changes, ["earth"]);
  hover.move(11, 20, true); hover.target("neptune", true);
  hover.move(12, 20, true); hover.target(null, true);
  hover.move(13, 20, true); hover.target("neptune", true);
  assert.deepEqual(changes, ["earth", "neptune", null, "neptune"]);
});

test("touch, dragging and tours discard pending hover rather than playing after suppression ends", () => {
  const changes: (string | null)[] = [];
  const hover = createDestinationHoverIntent((id) => changes.push(id));
  hover.move(10, 20, false); hover.target("earth", true);
  hover.move(11, 20, true); hover.target("earth", false);
  hover.target("earth", true);
  assert.deepEqual(changes, []);
  hover.move(12, 20, true); hover.target("earth", true);
  hover.clear(); hover.target("neptune", true);
  assert.deepEqual(changes, ["earth"]);
});
