import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceEntity, deleteWorkspaceEntity, emptyLocalWorkspace, exportWorkspaceJson, parseLocalWorkspace, parseWorkspaceJson, workspaceDocument, workspaceLimits, WorkspaceValidationError,
} from "../domain";
import {
  createLocalWorkspaceStore, readWorkspaceSnapshot, saveWorkspaceSnapshot, serializeLocalWorkspace, workspaceLockTimeoutMs, workspaceStorageKey, type WorkspaceStorage,
} from "./local-storage";
import { browserWorkspaceWriteLock, type WorkspaceWriteLock } from "./write-lock";

class MemoryStorage implements WorkspaceStorage {
  value: string | null = null;
  writes = 0;
  reads = 0;
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    assert.equal(key, workspaceStorageKey);
    this.reads++;
    if (this.failRead) throw new Error("synthetic denied storage");
    return this.value;
  }
  setItem(key: string, value: string) {
    assert.equal(key, workspaceStorageKey);
    if (this.failWrite) throw new Error("synthetic quota");
    this.writes++;
    this.value = value;
  }
}

const defaults = { universe: "Universe", galaxy: "Galaxy", cloud: "Cloud", system: "System" };
function serialWriteLock(): WorkspaceWriteLock {
  let tail = Promise.resolve();
  return (name, signal, operation) => {
    const result = tail.then(() => {
      assert.equal(name, workspaceStorageKey);
      signal.throwIfAborted();
      return operation();
    });
    tail = result.then(() => {}, () => {});
    return result;
  };
}
function workspace(name = "Local planet") {
  return createWorkspaceEntity(emptyLocalWorkspace(), { kind: "planet", name, description: "", seed: 42 }, defaults).workspace;
}

function taggedWorkspace(planets: number) {
  const base = workspace();
  const catalog = base.universes[0];
  const source = catalog.planets[0];
  return parseLocalWorkspace({ ...base, universes: [{ ...catalog, entities: [
    ...catalog.entities.slice(0, 4),
    ...Array.from({ length: planets }, (_, index) => ({ ...source, id: `tagged-planet-${index}`, tags: Array.from({ length: 32 }, () => "tag") })),
  ], initialTarget: { kind: "universe", id: catalog.rootId } }] });
}

test("missing storage starts empty without persisting a demo or placeholder", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readWorkspaceSnapshot(storage), { ok: true, workspace: emptyLocalWorkspace(), snapshot: null });
  assert.equal(storage.writes, 0);
  assert.match(workspaceStorageKey, /^hackuniverse\..*\.v1$/);
});

test("successful saves round-trip canonical content without a duplicate planets array", () => {
  const storage = new MemoryStorage();
  const original = workspace();
  const saved = saveWorkspaceSnapshot(storage, null, original);
  assert.ok(saved.ok);
  assert.equal(storage.writes, 1);
  assert.ok(!Object.hasOwn(JSON.parse(storage.value!).universes[0], "planets"));
  const loaded = readWorkspaceSnapshot(storage);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.workspace, original);
  assert.equal(loaded.workspace.universes[0].planets[0].seed, 42);
  assert.ok(Object.isFrozen(loaded.workspace.universes[0].entities));
});

test("corrupt, unsupported, inconsistent and oversized stored workspaces remain untouched", () => {
  const storage = new MemoryStorage();
  for (const raw of ["{not JSON", "null", JSON.stringify({ schemaVersion: 99, universes: [], activeUniverseId: null }),
    JSON.stringify({ schemaVersion: 1, universes: [], activeUniverseId: "missing" }), "x".repeat(workspaceLimits.bytes + 1)]) {
    storage.value = raw;
    assert.deepEqual(readWorkspaceSnapshot(storage), { ok: false, error: "corrupt" });
    assert.deepEqual(saveWorkspaceSnapshot(storage, raw, workspace()), { ok: false, error: "corrupt" });
    assert.equal(storage.value, raw);
    assert.equal(storage.writes, 0);
  }
});

test("unavailable storage and quota failures cannot pretend a change persisted", () => {
  const storage = new MemoryStorage();
  storage.failRead = true;
  assert.deepEqual(readWorkspaceSnapshot(storage), { ok: false, error: "unavailable" });
  storage.failRead = false;
  storage.failWrite = true;
  assert.deepEqual(saveWorkspaceSnapshot(storage, null, workspace()), { ok: false, error: "unavailable" });
  assert.equal(storage.value, null);
  assert.equal(storage.writes, 0);
});

test("a stale tab cannot overwrite a newer snapshot or silently retry", () => {
  const storage = new MemoryStorage();
  const newest = workspace("Another tab");
  const saved = saveWorkspaceSnapshot(storage, null, newest);
  assert.ok(saved.ok);
  assert.deepEqual(saveWorkspaceSnapshot(storage, null, workspace("Stale tab")), { ok: false, error: "conflict" });
  assert.equal(storage.writes, 1);
  assert.equal(storage.value, saved.snapshot);
});

test("an immediate competing write is detected without replacing the competitor again", () => {
  const competitor = serializeLocalWorkspace(workspace("Competing tab"));
  let value: string | null = null;
  let writes = 0;
  const storage: WorkspaceStorage = {
    getItem: () => value,
    setItem: () => { writes++; value = competitor; },
  };
  assert.deepEqual(saveWorkspaceSnapshot(storage, null, workspace()), { ok: false, error: "conflict" });
  assert.equal(writes, 1);
  assert.equal(value, competitor);
});

test("UTF-8 byte limits apply before persistence even when character count fits", () => {
  const base = workspace();
  const catalog = base.universes[0];
  const source = catalog.planets[0];
  const large = parseLocalWorkspace({ ...base, universes: [{ ...catalog, entities: [
    ...catalog.entities.slice(0, 4),
    ...Array.from({ length: 600 }, (_, index) => ({ ...source, id: `planet-${index}`, description: "😀".repeat(1000) })),
  ], initialTarget: { kind: "universe", id: catalog.rootId } }] });
  const raw = JSON.stringify(workspaceDocument(large));
  assert.ok(raw.length < workspaceLimits.bytes);
  assert.ok(new TextEncoder().encode(raw).length > workspaceLimits.bytes);
  assert.throws(() => serializeLocalWorkspace(large), (error: unknown) => error instanceof WorkspaceValidationError && error.code === "limit");
  const storage = new MemoryStorage();
  storage.value = raw;
  assert.deepEqual(readWorkspaceSnapshot(storage), { ok: false, error: "corrupt" });
  assert.equal(storage.writes, 0);
});

test("a normal mutation cannot persist a workspace that crosses the accepted import node budget", async () => {
  const storage = new MemoryStorage();
  // 1,249 fully tagged planets fit exactly at the 50,000 JSON node boundary.
  const accepted = parseWorkspaceJson(JSON.stringify(workspaceDocument(taggedWorkspace(1249))));
  const saved = saveWorkspaceSnapshot(storage, null, accepted);
  assert.ok(saved.ok);
  const store = createLocalWorkspaceStore(() => storage, serialWriteLock());
  store.reload();
  const before = store.getSnapshot();
  const changed = createWorkspaceEntity(accepted, { kind: "planet", name: "One more planet", description: "", seed: 7 }, defaults).workspace;
  await assert.rejects(store.commit(changed, before.snapshot), (error: unknown) => error instanceof WorkspaceValidationError && error.code === "limit");
  assert.equal(storage.writes, 1);
  assert.equal(storage.value, saved.snapshot);
  assert.equal(store.getSnapshot(), before);
  assert.equal(store.getSnapshot().error, null, "a content limit must not become storage unavailability");
  assert.deepEqual(parseWorkspaceJson(exportWorkspaceJson(accepted)), accepted);
});

test("legacy data above the transfer node budget stays readable until a valid reduction is saved", async () => {
  const storage = new MemoryStorage();
  const legacy = taggedWorkspace(1250);
  const raw = JSON.stringify(workspaceDocument(legacy));
  storage.value = raw;
  const loaded = readWorkspaceSnapshot(storage);
  assert.ok(loaded.ok);
  assert.deepEqual(loaded.workspace, legacy);
  assert.equal(storage.value, raw);
  assert.equal(storage.writes, 0);
  const store = createLocalWorkspaceStore(() => storage, serialWriteLock());
  store.reload();
  assert.equal(store.getSnapshot().error, null);
  const reduced = deleteWorkspaceEntity(store.getSnapshot().workspace, "tagged-planet-1249");
  assert.equal(await store.commit(reduced, store.getSnapshot().snapshot), true);
  assert.equal(storage.writes, 1);
  assert.deepEqual(parseWorkspaceJson(exportWorkspaceJson(reduced)), reduced);
  assert.equal(legacy.universes[0].planets.length, 1250);
});

test("the external store is SSR-safe and only publishes successfully persisted mutations", async () => {
  const storage = new MemoryStorage();
  const store = createLocalWorkspaceStore(() => storage, serialWriteLock());
  assert.equal(storage.reads, 0);
  assert.equal(store.getSnapshot().ready, false);
  assert.equal(store.getServerSnapshot(), store.getSnapshot());
  assert.equal(await store.commit(workspace(), null), false);
  assert.equal(storage.writes, 0);
  store.reload();
  assert.equal(store.getSnapshot().ready, true);
  storage.failWrite = true;
  assert.equal(await store.commit(workspace(), null), false);
  assert.deepEqual(store.getSnapshot().workspace, emptyLocalWorkspace());
  assert.equal(store.getSnapshot().error, "unavailable");
  storage.failWrite = false;
  store.reload();
  const next = workspace();
  assert.equal(await store.commit(next, null), true);
  assert.deepEqual(store.getSnapshot().workspace, next);
  assert.equal(store.getSnapshot().error, null);
  assert.equal(store.getServerSnapshot().ready, false, "hydration baseline never acquires browser data");
});

test("external changes adopt the latest valid workspace and invalidate stale render callbacks", async () => {
  const storage = new MemoryStorage();
  const store = createLocalWorkspaceStore(() => storage, serialWriteLock());
  store.reload();
  const staleSnapshot = store.getSnapshot().snapshot;
  const newest = workspace("Another tab");
  storage.value = serializeLocalWorkspace(newest);
  store.reload(true);
  assert.deepEqual(store.getSnapshot().workspace, newest);
  assert.equal(store.getSnapshot().error, "conflict");
  assert.equal(await store.commit(workspace("Stale form"), staleSnapshot), false);
  assert.equal(storage.writes, 0);
  assert.equal(await store.commit(newest, store.getSnapshot().snapshot), true);
  assert.equal(store.getSnapshot().error, null);
});

test("new corruption blocks writes while preserving the last good in-memory workspace", async () => {
  const storage = new MemoryStorage();
  const store = createLocalWorkspaceStore(() => storage, serialWriteLock());
  store.reload();
  const good = workspace();
  assert.equal(await store.commit(good, null), true);
  const snapshot = store.getSnapshot().snapshot;
  storage.value = "{corrupt";
  store.reload(true);
  assert.equal(store.getSnapshot().error, "corrupt");
  assert.deepEqual(store.getSnapshot().workspace, good);
  assert.equal(await store.commit(workspace("Do not overwrite"), snapshot), false);
  assert.equal(storage.value, "{corrupt");
  storage.value = snapshot;
  store.reload();
  assert.equal(store.getSnapshot().error, null);
});

test("permission failure resolving localStorage becomes recoverable unavailability", async () => {
  const store = createLocalWorkspaceStore(() => { throw new Error("synthetic browser denial"); });
  store.reload();
  assert.equal(store.getSnapshot().ready, true);
  assert.equal(store.getSnapshot().error, "unavailable");
  assert.equal(await store.commit(workspace(), null), false);
});

test("concurrent browser stores serialize the baseline check so only one competing mutation succeeds", async () => {
  const storage = new MemoryStorage();
  const lock = serialWriteLock();
  const first = createLocalWorkspaceStore(() => storage, lock);
  const second = createLocalWorkspaceStore(() => storage, lock);
  first.reload();
  second.reload();
  const winner = workspace("First tab");
  const competing = workspace("Second tab");
  assert.deepEqual(await Promise.all([first.commit(winner, null), second.commit(competing, null)]), [true, false]);
  assert.equal(storage.writes, 1);
  const persisted = readWorkspaceSnapshot(storage);
  assert.ok(persisted.ok);
  assert.deepEqual(persisted.workspace, winner);
  assert.deepEqual(first.getSnapshot().workspace, winner);
  assert.deepEqual(second.getSnapshot().workspace, winner);
  assert.equal(second.getSnapshot().error, "conflict");
});

test("lock rejection never writes or publishes an unsaved workspace and permits recovery", async () => {
  const storage = new MemoryStorage();
  const lock = serialWriteLock();
  let reject = true;
  const failing: WorkspaceWriteLock = (name, signal, operation) => reject ? Promise.reject(new Error("Synthetic lock rejection")) : lock(name, signal, operation);
  const store = createLocalWorkspaceStore(() => storage, failing);
  store.reload();
  assert.equal(await store.commit(workspace(), null), false);
  assert.equal(storage.writes, 0);
  assert.equal(store.getSnapshot().error, "unavailable");
  assert.deepEqual(store.getSnapshot().workspace, emptyLocalWorkspace());
  reject = false;
  store.reload();
  assert.equal(await store.commit(workspace(), null), true);
  assert.equal(storage.writes, 1);
});

test("a lock wait has a two-second bound and a late grant cannot mutate data", async () => {
  const storage = new MemoryStorage();
  let grant!: () => void;
  let signal: AbortSignal | undefined;
  const stalled: WorkspaceWriteLock = (_name, pendingSignal, operation) => {
    signal = pendingSignal;
    return new Promise((resolve) => { grant = () => resolve(operation()); });
  };
  const store = createLocalWorkspaceStore(() => storage, stalled);
  store.reload();
  const started = performance.now();
  assert.equal(await store.commit(workspace(), null), false);
  const elapsed = performance.now() - started;
  assert.ok(elapsed >= workspaceLockTimeoutMs - 100 && elapsed < workspaceLockTimeoutMs + 1000);
  assert.ok(signal?.aborted);
  assert.equal(store.getSnapshot().error, "unavailable");
  assert.deepEqual(store.getSnapshot().workspace, emptyLocalWorkspace());
  grant();
  await Promise.resolve();
  assert.equal(storage.writes, 0);
  assert.equal(storage.value, null);
});

test("browser locking is lazy, exclusive and cancellable, while unsupported browsers refuse writes", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: {} });
    const storage = new MemoryStorage();
    const store = createLocalWorkspaceStore(() => storage);
    assert.equal(storage.reads, 0);
    store.reload();
    assert.equal(await store.commit(workspace(), null), false);
    assert.equal(storage.writes, 0);
    assert.equal(store.getSnapshot().error, "unavailable");
    let options: LockOptions | undefined;
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: { locks: { request: (name: string, suppliedOptions: LockOptions, operation: () => boolean) => {
      assert.equal(name, workspaceStorageKey);
      options = suppliedOptions;
      return Promise.resolve(operation());
    } } } });
    const controller = new AbortController();
    assert.equal(await browserWorkspaceWriteLock(workspaceStorageKey, controller.signal, () => true), true);
    assert.equal(options?.mode, "exclusive");
    assert.equal(options?.signal, controller.signal);
    store.reload();
    assert.equal(await store.commit(workspace(), null), true);
    assert.equal(storage.writes, 1);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "navigator", descriptor);
    else Reflect.deleteProperty(globalThis, "navigator");
  }
});
