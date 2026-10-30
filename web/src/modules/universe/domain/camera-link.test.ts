import assert from "node:assert/strict";
import test from "node:test";
import { buildCameraLinkUrl, isCameraPose, readCameraLink, type UniverseCameraPose } from "./camera-link";

const pose: UniverseCameraPose = { position: [12.12345678, -24.25, 0.0001], target: [2, 3, -4] };
const query = (camera = "12,-24,0,2,3,-4", target = "planet-earth") => new URLSearchParams({ target, camera }).toString();

test("camera links distinguish ordinary URLs from incomplete, repeated or ambiguous commands", () => {
  for (const search of ["", "?lang=pt-BR&view=grid", "?source=demo", "?source=local"]) assert.deepEqual(readCameraLink(search), { kind: "none" });
  for (const search of ["?target=planet-earth", "?camera=1,2,3,4,5,6", `?${query()}&target=other`, `?${query()}&camera=1,2,3,4,5,6`, `?${query()}&source=demo&source=demo`, `?${query()}&source=account`, `?${query()}&source=`, "?source=unknown"]) assert.deepEqual(readCameraLink(search), { kind: "invalid" }, search);
});

test("only complete finite numeric coordinates and bounded nonzero separation are accepted", () => {
  for (const camera of ["", "1,2,3,4,5", "1,2,3,4,5,6,7", "1,,3,4,5,6", "1,2,3,4,5,6px", "1,2,3,4,5,Infinity", "1,2,3,4,5,NaN", "1,2,3,4,5,0x10", "1,2,3,4,5, ", "0,0,0,0,0,0", "0,0,0,0,0,0.00099", "10000001,0,0,0,0,0", "10000000,10000000,0,-10000000,-10000000,0", "1,2,3,4,5,1e999", "0".repeat(257)]) assert.deepEqual(readCameraLink(query(camera)), { kind: "invalid" }, camera);
  for (const camera of ["0,0,0,0,0,.001", "10000000,0,0,-10000000,0,0", "1e3,2e-4,-3,4,5,6"]) assert.equal(readCameraLink(query(camera)).kind, "valid", camera);
});

test("target identifiers use the canonical nonempty, bounded, control-free ID policy", () => {
  for (const target of ["", "   ", "x".repeat(257), "planet\nearth", "planet\u007fearth", "planet\u0085earth"]) assert.deepEqual(readCameraLink(query(undefined, target)), { kind: "invalid" });
  for (const target of ["planet-earth", "星球-地球", " legitimate space ", "x".repeat(256)]) {
    const result = readCameraLink(query(undefined, target));
    assert.equal(result.kind, "valid");
    if (result.kind === "valid") assert.equal(result.targetId, target);
  }
});

test("the public pose guard rejects unsafe shapes, accessor properties and extra coordinates", () => {
  let getterCalls = 0;
  const getter = { get position() { getterCalls++; return [1, 2, 3]; }, target: [0, 0, 0] };
  const decorated = [1, 2, 3]; Object.assign(decorated, { extra: 4 });
  for (const value of [null, [], {}, { position: [1, 2], target: [0, 0, 0] }, { position: [1, 2, 3, 4], target: [0, 0, 0] }, { position: ["1", 2, 3], target: [0, 0, 0] }, { position: [NaN, 2, 3], target: [0, 0, 0] }, { ...pose, extra: "field" }, { position: decorated, target: [0, 0, 0] }, getter]) assert.equal(isCameraPose(value), false);
  assert.equal(getterCalls, 0);
  assert.equal(isCameraPose(pose), true);
});

test("sharing preserves language, repeated unrelated parameters and hash while canonicalizing camera fields", () => {
  const href = buildCameraLinkUrl("https://example.test/explore?lang=pt-BR&tag=a&tag=b&camera=old&camera=duplicate&target=old#planet-notes", "planet-earth", pose, "demo");
  assert.ok(href);
  const url = new URL(href);
  assert.equal(url.pathname, "/explore");
  assert.equal(url.searchParams.get("lang"), "pt-BR");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.hash, "#planet-notes");
  assert.equal(url.searchParams.getAll("camera").length, 1);
  assert.equal(url.searchParams.getAll("target").length, 1);
  const result = readCameraLink(url.search);
  assert.equal(result.kind, "valid");
  if (result.kind !== "valid") return;
  assert.equal(result.targetId, "planet-earth"); assert.equal(result.source, "demo");
  assert.deepEqual(result.pose, { position: [12.123457, -24.25, 0.0001], target: [2, 3, -4] });
  assert.ok(Object.isFrozen(result.pose) && Object.isFrozen(result.pose.position) && Object.isFrozen(result.pose.target));
  assert.equal(buildCameraLinkUrl(href, result.targetId, result.pose, result.source), href);
});

test("source is explicit, local is supported and an omitted source removes stale URL selections", () => {
  const href = "http://localhost:3000/?lang=en&source=demo&source=local";
  const plain = buildCameraLinkUrl(href, "planet-earth", pose);
  assert.ok(plain); assert.equal(new URL(plain).searchParams.has("source"), false);
  const local = buildCameraLinkUrl(href, "planet-earth", pose, "local");
  assert.ok(local); assert.deepEqual(new URL(local).searchParams.getAll("source"), ["local"]);
  const result = readCameraLink(new URL(local).search);
  assert.equal(result.kind, "valid");
  if (result.kind === "valid") assert.equal(result.source, "local");
});

test("rounding cannot publish a collapsed or out-of-bounds pose", () => {
  const close: UniverseCameraPose = { position: [0.000707107, 0.000707107, 0], target: [0, 0, 0] };
  assert.equal(isCameraPose(close), true);
  assert.equal(buildCameraLinkUrl("https://example.test/", "planet-earth", close), null);
  const boundary: UniverseCameraPose = { position: [10_000_000, 0, 0], target: [-10_000_000, 0, 0] };
  const href = buildCameraLinkUrl("https://example.test/", "planet-earth", boundary);
  assert.ok(href); assert.equal(readCameraLink(new URL(href).search).kind, "valid");
});

test("invalid builders fail closed without returning unsafe or partial URLs", () => {
  for (const href of ["relative/path", "not a URL", "javascript:alert(1)", "file:///tmp/map", "https://user:password@example.test/"]) assert.equal(buildCameraLinkUrl(href, "planet-earth", pose), null);
  assert.equal(buildCameraLinkUrl("https://example.test/", "", pose), null);
  assert.equal(buildCameraLinkUrl("https://example.test/", "planet-\ud800", pose), null);
  assert.equal(buildCameraLinkUrl("https://example.test/", "planet-earth", { position: [0, 0, 0], target: [0, 0, 0] }), null);
  assert.equal(buildCameraLinkUrl("https://example.test/", "planet-earth", pose, "account" as "demo"), null);
});
