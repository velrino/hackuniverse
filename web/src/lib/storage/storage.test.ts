import assert from "node:assert/strict";
import test from "node:test";
import { browserStorage, createStorageService, type StorageService } from "./index";

class MemoryStorage implements StorageService {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test("constructing the service is lazy and preserves exact existing strings and native receivers", () => {
  const native = new MemoryStorage();
  native.values.set("hackuniverse.audio.v1", '{"schemaVersion":1,"musicEnabled":false}');
  let resolutions = 0;
  const storage = createStorageService(() => { resolutions++; return native; });
  assert.equal(resolutions, 0);
  assert.equal(storage.getItem("hackuniverse.audio.v1"), '{"schemaVersion":1,"musicEnabled":false}');
  for (const value of ["", "0", "false", "1", "宇宙 🌌", "{invalid json"]) {
    storage.setItem("key", value);
    assert.equal(storage.getItem("key"), value);
  }
  storage.removeItem("key");
  assert.equal(storage.getItem("key"), null);
  assert.equal(native.values.size, 1);
});

test("storage permission and quota failures reach the caller without fake persistence or removal", () => {
  const blocked = new Error("Synthetic denied access");
  const unavailable = createStorageService(() => { throw blocked; });
  assert.throws(() => unavailable.getItem("key"), (error) => error === blocked);
  assert.throws(() => unavailable.setItem("key", "next"), (error) => error === blocked);
  assert.throws(() => unavailable.removeItem("key"), (error) => error === blocked);

  const quota = new Error("Synthetic quota exceeded");
  const failedRemoval = new Error("Synthetic removal denied");
  const native = new MemoryStorage();
  native.values.set("key", "saved");
  const storage = createStorageService(() => ({
    getItem: native.getItem.bind(native),
    setItem: () => { throw quota; },
    removeItem: () => { throw failedRemoval; },
  }));
  assert.throws(() => storage.setItem("key", "unsaved"), (error) => error === quota);
  assert.equal(storage.getItem("key"), "saved");
  assert.throws(() => storage.removeItem("key"), (error) => error === failedRemoval);
  assert.equal(storage.getItem("key"), "saved");
});

test("each operation resolves current capabilities so failure and recovery are not cached", () => {
  const first = new MemoryStorage();
  const second = new MemoryStorage();
  first.setItem("key", "first");
  second.setItem("key", "second");
  let current: StorageService | null = first;
  const storage = createStorageService(() => {
    if (!current) throw new Error("Synthetic unavailable storage");
    return current;
  });
  assert.equal(storage.getItem("key"), "first");
  current = null;
  assert.throws(() => storage.getItem("key"));
  current = second;
  assert.equal(storage.getItem("key"), "second");
  storage.setItem("key", "updated");
  assert.equal(first.getItem("key"), "first");
  assert.equal(second.getItem("key"), "updated");
});

test("the browser service imports without window and only accesses localStorage during operations", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    Reflect.deleteProperty(globalThis, "window");
    assert.throws(() => browserStorage.getItem("key"), /Browser storage unavailable/);
    const native = new MemoryStorage();
    let reads = 0;
    let blocked = true;
    Object.defineProperty(globalThis, "window", { configurable: true, value: {
      get localStorage() {
        reads++;
        if (blocked) throw new Error("Synthetic blocked browser storage");
        return native;
      },
    } });
    assert.equal(reads, 0);
    assert.throws(() => browserStorage.setItem("key", "value"), /Synthetic blocked/);
    assert.equal(reads, 1);
    blocked = false;
    browserStorage.setItem("key", "value");
    assert.equal(browserStorage.getItem("key"), "value");
    browserStorage.removeItem("key");
    assert.equal(browserStorage.getItem("key"), null);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
