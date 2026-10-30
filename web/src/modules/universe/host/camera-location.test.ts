import assert from "node:assert/strict";
import test from "node:test";
import { createCameraLocation, type CameraSnapshot } from "./camera-location";
import { buildCameraLinkUrl, readCameraLink, type CameraLinkSource, type UniverseCameraPose } from "../domain/camera-link";
import { parseUniverseCatalog } from "../domain/parse-catalog";

const pose: UniverseCameraPose = { position: [10, 20, 30], target: [0, 0, 0] };
const moved: UniverseCameraPose = { position: [40, 50, 60], target: [1, 2, 3] };
const capture = (id = "earth", camera = pose): CameraSnapshot => ({ target: { kind: "planet", id }, pose: camera });
function catalog(extra = false, renamed = false) {
  return parseUniverseCatalog({ schemaVersion: 1, mode: "demo", rootId: "universe", initialTarget: { kind: "planet", id: "earth" }, entities: [
    { id: "universe", kind: "universe", parentId: null, name: "Universe", description: "", seed: 1 },
    { id: "galaxy", kind: "galaxy", parentId: "universe", name: "Galaxy", description: "", seed: 2 },
    { id: "cloud", kind: "cloud", parentId: "galaxy", name: "Cloud", description: "", seed: 3 },
    { id: "system", kind: "system", parentId: "cloud", name: "System", description: "", seed: 4 },
    { id: "earth", kind: "planet", parentId: "system", name: renamed ? "Renamed Earth" : "Earth", description: "Private illustrative content must never enter a location URL", seed: 5 },
    ...(extra ? [{ id: "neptune", kind: "planet", parentId: "system", name: "Neptune", description: "", seed: 6 }] : []),
  ] });
}
function link(id = "earth", camera = pose, source: CameraLinkSource = "demo") {
  const href = buildCameraLinkUrl("https://map.example/?lang=en#start", id, camera, source);
  assert.ok(href);
  return href;
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((success) => { resolve = success; });
  return { promise, resolve };
}
function fixture(href = "https://map.example/?lang=en#start", source: CameraLinkSource = "demo", initial = catalog()) {
  let currentHref = href;
  let now = 0;
  let timerId = 0;
  let read = capture();
  let clipboard = () => Promise.resolve();
  const timers = new Map<number, { at: number; run(): void }>();
  const replaced: string[] = [];
  const copied: string[] = [];
  const controller = createCameraLocation(initial, source, {
    href: () => currentHref,
    replace(url) { currentHref = url; replaced.push(url); },
    copy(text) { copied.push(text); return clipboard(); },
    later(run, milliseconds) { const id = ++timerId; timers.set(id, { at: now + milliseconds, run }); return id; },
    cancel(timer) { timers.delete(timer as number); },
  });
  return {
    controller, replaced, copied,
    href: () => currentHref,
    setHref(next: string) { currentHref = next; },
    reader(next = read) { read = next; controller.attach(() => read); },
    setReader(next: CameraSnapshot) { read = next; },
    copyWith(operation: () => Promise<void>) { clipboard = operation; },
    timerCount: () => timers.size,
    advance(milliseconds: number) {
      const end = now + milliseconds;
      for (;;) {
        const entry = [...timers].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break;
        now = entry[1].at; timers.delete(entry[0]); entry[1].run();
      }
      now = end;
    },
  };
}

test("valid entry requests the canonical target, suppresses the automatic tour and clears intent after acknowledgement", () => {
  const instance = fixture(link()); instance.controller.mount();
  const state = instance.controller.getSnapshot();
  assert.equal(state.ready, true); assert.equal(state.suppressAutoTour, true);
  assert.deepEqual(state.navigationRequest?.target, capture().target);
  assert.deepEqual(state.restore?.pose, pose);
  assert.equal(state.canShare, false);
  instance.reader();
  const beforeStaleAck = instance.controller.getSnapshot();
  instance.controller.restored("unrelated-token", true);
  assert.equal(instance.controller.getSnapshot(), beforeStaleAck, "a stale renderer acknowledgement cannot consume the request");
  instance.controller.restored(state.restore!.token, true);
  assert.equal(instance.controller.getSnapshot().restore, undefined);
  assert.equal(instance.controller.getSnapshot().navigationRequest, undefined);
  assert.equal(instance.controller.getSnapshot().canShare, true);
  assert.equal(instance.controller.getSnapshot().suppressAutoTour, true);
});

test("a missing target stays unavailable until the actual catalog contains it", () => {
  const instance = fixture(link("neptune")); instance.controller.mount();
  assert.equal(instance.controller.getSnapshot().status, "unavailable");
  assert.equal(instance.controller.getSnapshot().navigationRequest, undefined);
  instance.controller.capture(capture(), "navigation"); instance.advance(500);
  assert.equal(instance.replaced.length, 0, "the initial fallback must not overwrite the unresolved link");
  instance.controller.update(catalog(true), "demo");
  assert.equal(instance.controller.getSnapshot().restore?.target.id, "neptune");
  assert.equal(instance.controller.getSnapshot().status, "idle");
});

test("malformed external camera data does not override the initial view or rewrite its URL automatically", () => {
  const href = "https://map.example/?lang=pt-BR&target=earth&camera=not-a-camera#notes";
  const instance = fixture(href); instance.controller.mount();
  assert.equal(instance.controller.getSnapshot().status, "invalid");
  assert.equal(instance.controller.getSnapshot().navigationRequest, undefined);
  assert.equal(instance.controller.getSnapshot().restore, undefined);
  instance.controller.capture(capture(), "navigation"); instance.advance(500);
  assert.equal(instance.href(), href);
  instance.controller.capture(capture("earth", moved), "manual"); instance.advance(200);
  assert.equal(instance.controller.getSnapshot().status, "idle");
  assert.equal(new URL(instance.href()).searchParams.get("lang"), "pt-BR");
});

test("manual captures coalesce for 200ms and serialize against the latest locale, query and hash", () => {
  const instance = fixture(); instance.controller.mount();
  instance.controller.capture(capture(), "manual"); instance.advance(100);
  instance.controller.capture(capture("earth", moved), "manual");
  instance.setHref("https://map.example/?lang=pt-BR&view=grid&tag=a&tag=b#changed");
  instance.advance(199); assert.equal(instance.replaced.length, 0);
  instance.advance(1); assert.equal(instance.replaced.length, 1);
  const url = new URL(instance.href());
  assert.equal(url.searchParams.get("lang"), "pt-BR");
  assert.equal(url.searchParams.get("view"), "grid");
  assert.deepEqual(url.searchParams.getAll("tag"), ["a", "b"]);
  assert.equal(url.hash, "#changed");
  const parsed = readCameraLink(url.search); assert.equal(parsed.kind, "valid");
  if (parsed.kind === "valid") assert.deepEqual(parsed.pose, moved);
});

test("an external history command cancels queued writes and locale-only changes do not restore twice", () => {
  const instance = fixture(link(), "demo", catalog(true)); instance.controller.mount();
  const token = instance.controller.getSnapshot().restore!.token;
  instance.reader(); instance.controller.restored(token, true);
  instance.controller.capture(capture("earth", moved), "manual");
  instance.setHref(link("neptune")); instance.controller.receive();
  assert.equal(instance.timerCount(), 0);
  assert.equal(instance.controller.getSnapshot().restore?.target.id, "neptune");
  instance.advance(1000); assert.equal(instance.replaced.length, 0);
  const pending = instance.controller.getSnapshot().restore!;
  const localized = new URL(instance.href()); localized.searchParams.set("lang", "pt-BR"); localized.hash = "new-hash";
  instance.setHref(localized.href); instance.controller.receive();
  assert.equal(instance.controller.getSnapshot().restore, pending, "unrelated URL changes cannot create another restore token");
});

test("explicit sources cannot be applied to a different catalog source", () => {
  const instance = fixture(link("earth", pose, "local"), "demo"); instance.controller.mount();
  assert.equal(instance.controller.getSnapshot().status, "unavailable");
  assert.equal(instance.controller.getSnapshot().restore, undefined);
  instance.controller.update(catalog(), "local");
  assert.equal(instance.controller.getSnapshot().restore?.target.id, "earth");
  assert.equal(instance.controller.getSnapshot().suppressAutoTour, true);
});

test("copy reads the actual current camera synchronously and shares only location fields", async () => {
  const instance = fixture("https://map.example/?lang=pt-BR#details", "local");
  instance.controller.mount(); instance.reader();
  instance.controller.capture(capture(), "manual");
  instance.setReader(capture("earth", moved));
  const pending = deferred(); instance.copyWith(() => pending.promise);
  const operation = instance.controller.copy();
  assert.equal(instance.copied.length, 1, "Clipboard must be invoked inside the original click");
  assert.equal(instance.timerCount(), 0);
  const url = new URL(instance.copied[0]);
  const parsed = readCameraLink(url.search); assert.equal(parsed.kind, "valid");
  if (parsed.kind === "valid") { assert.deepEqual(parsed.pose, moved); assert.equal(parsed.source, "local"); }
  assert.equal(url.searchParams.get("lang"), "pt-BR"); assert.equal(url.hash, "#details");
  assert.equal(url.searchParams.has("entities"), false);
  assert.equal(url.searchParams.has("universes"), false);
  assert.equal(url.href.includes("Private"), false);
  pending.resolve(); await operation;
  assert.equal(instance.controller.getSnapshot().status, "copied");
});

test("disposing prevents a pending clipboard result from publishing later", async () => {
  const instance = fixture(); instance.controller.mount(); instance.reader();
  const pending = deferred(); instance.copyWith(() => pending.promise);
  const operation = instance.controller.copy();
  instance.controller.dispose();
  const disposed = instance.controller.getSnapshot();
  pending.resolve(); await operation;
  assert.equal(instance.controller.getSnapshot(), disposed);
  instance.advance(1000); assert.equal(instance.timerCount(), 0);
});

test("own history replacement and catalog renames do not reapply an acknowledged camera", () => {
  const instance = fixture(link()); instance.controller.mount(); instance.reader();
  instance.controller.restored(instance.controller.getSnapshot().restore!.token, true);
  instance.controller.update(catalog(false, true), "demo");
  assert.equal(instance.controller.getSnapshot().restore, undefined);
  assert.equal(instance.controller.getSnapshot().navigationRequest, undefined);
  instance.controller.capture(capture("earth", moved), "navigation"); instance.advance(200);
  assert.equal(instance.replaced.length, 1);
  const before = instance.controller.getSnapshot(); instance.controller.receive();
  assert.equal(instance.controller.getSnapshot(), before);
  assert.equal(instance.controller.getSnapshot().restore, undefined);
});
