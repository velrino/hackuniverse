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
  let effectDuration = 0.6065;
  const contexts: Context[] = [];
  const players: Player[] = [];
  const effectSources: { starts: number[]; stops: number[]; onended: (() => void) | null }[] = [];
  const ramps: { value: number; at: number }[] = [];
  const envelopes: { type: "cancel" | "set" | "ramp"; value?: number; at: number }[] = [];
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
    createGain() { return { ...node(), gain: { value: 1, setTargetAtTime(value: number) { gains.push(value); }, cancelScheduledValues(at: number) { envelopes.push({ type: "cancel", at }); }, setValueAtTime(value: number, at: number) { this.value = value; envelopes.push({ type: "set", value, at }); }, linearRampToValueAtTime(value: number, at: number) { ramps.push({ value, at }); envelopes.push({ type: "ramp", value, at }); } } }; }
    createMediaElementSource(player: Player) { assert.ok(players.includes(player)); return node(); }
    decodeAudioData() { return Promise.resolve({ duration: effectDuration, numberOfChannels: 2 }); }
    createBufferSource() {
      const source = { ...node(), buffer: null, starts: [] as number[], stops: [] as number[], onended: null as (() => void) | null,
        start(at = 0) { source.starts.push(at); },
        stop: (at = 0) => { source.stops.push(at); if (at <= this.currentTime) source.onended?.(); },
      };
      effectSources.push(source);
      return source;
    }
  }
  for (const [key, value] of [["window", { AudioContext: Context }], ["Audio", Player]] as const) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    t.after(() => { if (original) Object.defineProperty(globalThis, key, original); else Reflect.deleteProperty(globalThis, key); });
  }
  return { gains, contexts, players, effectSources, ramps, envelopes, disconnects: () => disconnects, playWith(operation: () => Promise<void>) { play = operation; }, resumeWith(operation: () => Promise<void>) { resume = operation; }, effectDuration(value: number) { effectDuration = value; } };
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

test("a suspended activation deadline remains recoverable by a later real gesture", async (t) => {
  const fake = browser(t); fake.resumeWith(pending); t.mock.timers.enable({ apis: ["setTimeout"] });
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const rejected = assert.rejects(effects.resume(new AbortController().signal), (error: unknown) => error instanceof DOMException && error.name === "NotAllowedError");
  t.mock.timers.tick(15_000); await rejected;
  fake.resumeWith(() => Promise.resolve());
  await effects.resume(new AbortController().signal);
  assert.equal(effects.isRunning(), true);
  effects.dispose();
});

test("a stalled media load with an already running context remains a load failure", async (t) => {
  const fake = browser(t); fake.playWith(pending); t.mock.timers.enable({ apis: ["setTimeout"] });
  const music = createBrowserAudioPorts().createMusic({ paused() {}, failed() {} });
  const rejected = assert.rejects(music.play(), (error: unknown) => error instanceof Error && error.name !== "NotAllowedError" && error.message.includes("timed out"));
  await flush();
  assert.equal(fake.contexts[0].state, "running");
  t.mock.timers.tick(15_000); await rejected;
  assert.equal(fake.players[0].paused, true);
  music.dispose();
});

test("zoom handoff fades the old voice and schedules its replacement without retaining tails after suspend", async (t) => {
  const fake = browser(t);
  t.mock.method(globalThis, "fetch", async () => new Response(new ArrayBuffer(8), { status: 200 }));
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const signal = new AbortController().signal;
  await effects.resume(signal); await effects.load(signal);
  let firstEnded = 0; let secondEnded = 0;
  const first = effects.play("zoom-in", () => firstEnded++);
  first.stop(0.008);
  effects.play("zoom-out", () => secondEnded++, 0.008);
  assert.deepEqual(fake.ramps, [{ value: 0, at: 0.008 }]);
  assert.deepEqual(fake.effectSources[0].stops, [0.008]);
  assert.deepEqual(fake.effectSources[1].starts, [0.008]);
  assert.equal(firstEnded, 0, "the replacement takes over after the original's short fade");
  await effects.suspend();
  assert.deepEqual(fake.effectSources[0].stops, [0.008, 0]);
  assert.deepEqual(fake.effectSources[1].stops, [0]);
  assert.equal(firstEnded, 1); assert.equal(secondEnded, 1);
  const disconnects = fake.disconnects();
  fake.effectSources[0].onended?.(); fake.effectSources[1].onended?.();
  assert.equal(fake.disconnects(), disconnects, "late callbacks cannot clean up a newer voice or disconnect twice");
  effects.dispose();
  assert.equal(fake.contexts[0].state, "closed");
});

test("releasing before a handoff starts cancels its scheduled voice instead of playing a short tail", async (t) => {
  const fake = browser(t);
  t.mock.method(globalThis, "fetch", async () => new Response(new ArrayBuffer(8), { status: 200 }));
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const signal = new AbortController().signal;
  await effects.resume(signal); await effects.load(signal);
  let ended = 0;
  const voice = effects.play("zoom-out", () => ended++, 0.008);
  voice.stop(0.02);
  assert.deepEqual(fake.effectSources[0].starts, [0.008]);
  assert.deepEqual(fake.effectSources[0].stops, [0]);
  assert.deepEqual(fake.ramps, [], "a recording that has not started has no audible tail to fade");
  assert.equal(ended, 1);
  effects.dispose();
});

test("fourteen movement samples renew one source's native deadline even when JavaScript timers never run", async (t) => {
  const fake = browser(t); fake.effectDuration(5);
  t.mock.method(globalThis, "fetch", async () => new Response(new ArrayBuffer(8), { status: 200 }));
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const signal = new AbortController().signal;
  await effects.resume(signal); await effects.load(signal);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let ended = 0;
  const voice = effects.play("zoom-in", () => ended++);
  const context = fake.contexts[0];
  for (let sample = 0; sample < 14; sample++) {
    context.currentTime = sample * 0.14;
    assert.equal(voice.renew(0.18, 0.02), true);
    assert.ok(Math.abs(fake.effectSources[0].stops.at(-1)! - (context.currentTime + 0.2)) < 1e-10);
  }
  assert.equal(fake.effectSources.length, 1);
  assert.deepEqual(fake.effectSources[0].starts, [0]);
  assert.equal(fake.effectSources[0].stops.length, 14);
  assert.equal(ended, 0);
  const deadline = fake.effectSources[0].stops.at(-1)!;
  const attackRamps = fake.envelopes.filter((entry) => entry.type === "ramp" && entry.value === 1);
  assert.equal(attackRamps.length, 14);
  attackRamps.forEach((entry, index) => assert.ok(entry.at - index * 0.14 <= 0.004 + 1e-10));
  // Audio time progresses independently of the frozen JS timer queue and a delayed onended callback.
  context.currentTime = deadline + 3;
  assert.equal(voice.renew(0.18, 0.02), false);
  assert.equal(fake.effectSources[0].stops.length, 14, "an expired source must not receive a new native stop time");
  assert.equal(ended, 1);
  fake.effectSources[0].onended?.();
  assert.equal(ended, 1);
  effects.dispose();
});

test("renewal replaces the previous release envelope and an explicit stop cannot extend its deadline", async (t) => {
  const fake = browser(t); fake.effectDuration(5);
  t.mock.method(globalThis, "fetch", async () => new Response(new ArrayBuffer(8), { status: 200 }));
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const signal = new AbortController().signal;
  await effects.resume(signal); await effects.load(signal);
  let ended = 0;
  const voice = effects.play("camera-orbit", () => ended++);
  const context = fake.contexts[0];
  assert.equal(voice.renew(0.12, 0.02), true);
  context.currentTime = 0.13;
  assert.equal(voice.renew(0.12, 0.02), true, "a new sample can recover a not-yet-ended release");
  assert.ok(fake.envelopes.some((entry) => entry.type === "cancel" && entry.at === 0.13));
  assert.ok(fake.envelopes.some((entry) => entry.type === "ramp" && entry.value === 1 && entry.at <= 0.134));
  context.currentTime = 0.265;
  voice.stop(0.02);
  assert.ok(Math.abs(fake.effectSources[0].stops.at(-1)! - 0.27) < 1e-10, "release cannot postpone an existing earlier audio deadline");
  const stops = fake.effectSources[0].stops.length;
  assert.equal(voice.renew(0.12, 0.02), false, "an explicit stop cannot be undone by stale input");
  assert.equal(fake.effectSources[0].stops.length, stops);
  assert.equal(ended, 1);
  effects.dispose();
});

test("natural completion and scheduled cancellation reject renewal before delayed ended delivery", async (t) => {
  const fake = browser(t);
  t.mock.method(globalThis, "fetch", async () => new Response(new ArrayBuffer(8), { status: 200 }));
  const effects = createBrowserAudioPorts().createEffects(() => {});
  const signal = new AbortController().signal;
  await effects.resume(signal); await effects.load(signal);
  let ended = 0;
  const natural = effects.play("zoom-in", () => ended++);
  assert.equal(natural.renew(5, 0.02), true);
  assert.equal(fake.effectSources[0].stops.at(-1), 0.6065);
  fake.contexts[0].currentTime = 0.607;
  assert.equal(natural.renew(0.18, 0.02), false);
  assert.equal(fake.effectSources[0].stops.length, 1);
  assert.equal(ended, 1);
  const scheduled = effects.play("zoom-out", () => ended++, 0.008);
  assert.equal(scheduled.renew(0.18, 0.02), true);
  scheduled.stop(0.02);
  assert.equal(fake.effectSources[1].stops.at(-1), 0.607);
  assert.equal(scheduled.renew(0.18, 0.02), false);
  assert.equal(ended, 2);
  effects.dispose();
});
