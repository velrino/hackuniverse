import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { createBrowserAudioPorts } from "./browser-audio";

const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };
const pending = () => new Promise<void>(() => {});

function browser(t: TestContext) {
  const gains: number[] = [];
  let play = () => Promise.resolve();
  let resume = () => Promise.resolve();
  let disconnects = 0;
  const contexts: Context[] = [];
  const players: Player[] = [];
  class Player extends EventTarget {
    preload = "";
    loop = false;
    src = "";
    error: null = null;
    paused = true;
    loads = 0;
    constructor() { super(); players.push(this); }
    play() { this.paused = false; return play(); }
    pause() { this.paused = true; this.dispatchEvent(new Event("pause")); }
    load() { this.loads++; }
    removeAttribute(name: string) { if (name === "src") this.src = ""; }
  }
  const node = () => ({ connect() {}, disconnect() { disconnects++; } });
  class Context extends EventTarget {
    state = "suspended";
    currentTime = 0;
    destination = {};
    constructor() { super(); contexts.push(this); }
    resume() { return resume().then(() => { this.state = "running"; this.dispatchEvent(new Event("statechange")); }); }
    suspend() { this.state = "suspended"; this.dispatchEvent(new Event("statechange")); return Promise.resolve(); }
    close() { this.state = "closed"; return Promise.resolve(); }
    createGain() { return { ...node(), gain: { setTargetAtTime(value: number) { gains.push(value); } } }; }
    createMediaElementSource(player: Player) { assert.ok(players.includes(player)); return node(); }
  }
  for (const [key, value] of [["window", { AudioContext: Context }], ["Audio", Player]] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  return { gains, contexts, players, disconnects: () => disconnects, playWith(operation: () => Promise<void>) { play = operation; }, resumeWith(operation: () => Promise<void>) { resume = operation; } };
}

test("music stays a lazy streamed loop and volume uses gain instead of media volume", async (t) => {
  const fake = browser(t);
  const ports = createBrowserAudioPorts();
  assert.equal(fake.contexts.length, 0); assert.equal(fake.players.length, 0);
  const music = ports.createMusic({ paused() {}, failed() {} });
  assert.equal(fake.players[0].preload, "none");
  assert.equal(fake.players[0].loop, true);
  assert.equal(fake.players[0].loads, 0);
  music.setVolume(0.25);
  assert.deepEqual(fake.gains, [0.25]);
  await music.play();
  assert.equal(fake.contexts[0].state, "running");
  music.dispose();
  assert.equal(fake.contexts[0].state, "closed");
  assert.equal(fake.players[0].src, "");
  assert.equal(fake.disconnects(), 2);
});

test("music play or context activation that never settles times out and pauses", async (t) => {
  const fake = browser(t); t.mock.timers.enable({ apis: ["setTimeout"] });
  for (const failure of ["play", "resume"] as const) {
    fake.playWith(failure === "play" ? pending : () => Promise.resolve());
    fake.resumeWith(failure === "resume" ? pending : () => Promise.resolve());
    const music = createBrowserAudioPorts().createMusic({ paused() {}, failed() {} });
    const rejected = assert.rejects(music.play(), /timed out/);
    t.mock.timers.tick(15_000); await rejected; await flush();
    assert.equal(fake.players.at(-1)?.paused, true);
    assert.equal(fake.contexts.at(-1)?.state, "suspended");
    music.dispose();
  }
});

test("pausing cancels a pending music attempt and its deadline without late side effects", async (t) => {
  const fake = browser(t); fake.playWith(pending); t.mock.timers.enable({ apis: ["setTimeout"] });
  const music = createBrowserAudioPorts().createMusic({ paused() {}, failed() {} });
  const rejected = assert.rejects(music.play(), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  music.pause(); await rejected;
  t.mock.timers.tick(30_000); await flush();
  assert.equal(fake.players[0].paused, true);
  music.dispose();
});

test("effects activation has its own deadline even after all assets are ready", async (t) => {
  const fake = browser(t); fake.resumeWith(pending); t.mock.timers.enable({ apis: ["setTimeout"] });
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const rejected = assert.rejects(effects.resume(new AbortController().signal), /activation timed out/);
  t.mock.timers.tick(15_000); await rejected;
  effects.dispose();
  assert.equal(fake.contexts[0].state, "closed");
});

test("aborting an effects activation clears its pending deadline", async (t) => {
  const fake = browser(t); fake.resumeWith(pending); t.mock.timers.enable({ apis: ["setTimeout"] });
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const abort = new AbortController();
  const rejected = assert.rejects(effects.resume(abort.signal), (error: unknown) => error instanceof DOMException && error.name === "AbortError");
  abort.abort(); await rejected;
  effects.dispose(); t.mock.timers.tick(30_000); await flush();
  assert.equal(fake.contexts[0].state, "closed");
});
