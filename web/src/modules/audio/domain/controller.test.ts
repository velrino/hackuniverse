import assert from "node:assert/strict";
import test from "node:test";
import { createAudioController } from "./controller";
import { defaultAudioPreferences, readAudioPreferences } from "./preferences";
import type { AudioCue, AudioPorts, AudioPreferences } from "./types";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let index = 0; index < 8; index++) await Promise.resolve(); };

function fixture(saved: unknown = null) {
  const calls: string[] = [];
  let now = 0;
  let running = false;
  let storageFails = false;
  let musicPlay = () => Promise.resolve();
  let effectsLoad = (signal: AbortSignal) => { void signal; return Promise.resolve(); };
  let effectsResume = () => Promise.resolve();
  let effectsPlayFails = false;
  let synchronousEnd = false;
  let musicEvents: Parameters<AudioPorts["createMusic"]>[0] | undefined;
  let interrupted: (() => void) | undefined;
  const voices: { cue: AudioCue; stop(): void; finish(): void }[] = [];
  const ports: AudioPorts = {
    readPreferences: () => saved,
    writePreferences: (preferences) => { calls.push("persist"); if (storageFails) throw new Error("Unavailable"); saved = { schemaVersion: 1, ...preferences }; },
    now: () => now,
    createMusic(events) {
      calls.push("create-music"); musicEvents = events;
      return {
        play: () => { calls.push("play-music"); return musicPlay(); },
        pause: () => { calls.push("pause-music"); events.paused(); },
        setVolume: (value) => { calls.push(`music-volume:${value}`); },
        dispose: () => { calls.push("dispose-music"); },
      };
    },
    createEffects(listener) {
      calls.push("create-effects"); interrupted = listener;
      return {
        resume: () => { calls.push("resume-effects"); running = true; return effectsResume(); },
        suspend: () => { calls.push("suspend-effects"); running = false; return Promise.resolve(); },
        isRunning: () => running,
        load: (signal) => { calls.push("load-effects"); return effectsLoad(signal); },
        setVolume: (value) => { calls.push(`effects-volume:${value}`); },
        dispose: () => { calls.push("dispose-effects"); running = false; },
        play(cue, ended) {
          calls.push(`cue:${cue}`);
          if (effectsPlayFails) throw new Error("Sound could not start");
          const voice = { cue, stop() { calls.push("stop-voice"); ended(); }, finish: ended };
          voices.push(voice);
          if (synchronousEnd) ended();
          return voice;
        },
      };
    },
  };
  const controller = createAudioController(ports);
  return {
    controller, calls, voices,
    clock(value: number) { now = value; },
    storageFailure() { storageFails = true; },
    playWith(operation: () => Promise<void>) { musicPlay = operation; },
    loadWith(operation: (signal: AbortSignal) => Promise<void>) { effectsLoad = operation; },
    resumeWith(operation: () => Promise<void>) { effectsResume = operation; },
    pauseUnexpectedly() { musicEvents?.paused(); },
    interruptEffects() { running = false; interrupted?.(); },
    failEffectsPlay(value: boolean) { effectsPlayFails = value; },
    endEffectsSynchronously() { synchronousEnd = true; },
  };
}

test("initial and restored preferences never allocate, fetch, unlock or play audio without enable", () => {
  for (const saved of [null, { schemaVersion: 1, musicEnabled: true, effectsEnabled: true, musicVolume: 0.2, effectsVolume: 0.4 }]) {
    const { controller, calls } = fixture(saved);
    assert.deepEqual(controller.getServerSnapshot().preferences, defaultAudioPreferences);
    controller.mount(); controller.playCue("menu-open");
    assert.deepEqual(calls, []);
    assert.equal(controller.getSnapshot().musicStatus, saved ? "idle" : "off");
    assert.equal(controller.getSnapshot().effectsStatus, saved ? "idle" : "off");
    controller.setVisible(false); controller.setVisible(true);
    assert.deepEqual(calls, []);
  }
});

test("enabling invokes gesture-sensitive play/resume before asynchronous loading", async () => {
  const { controller, calls } = fixture();
  controller.mount(); controller.enableMusic(); controller.enableEffects();
  assert.ok(calls.includes("play-music"));
  assert.ok(calls.indexOf("resume-effects") < calls.indexOf("load-effects"));
  assert.equal(controller.getSnapshot().musicStatus, "loading");
  await flush();
  assert.equal(controller.getSnapshot().musicStatus, "playing");
  assert.equal(controller.getSnapshot().effectsStatus, "ready");
});

test("rejected autoplay is an honest recoverable error and does not disable the other channel", async () => {
  const instance = fixture();
  instance.playWith(() => Promise.reject(Object.assign(new Error("Blocked"), { name: "NotAllowedError" })));
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.enableEffects();
  await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "error");
  assert.equal(instance.controller.getSnapshot().musicError, "blocked");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  instance.playWith(() => Promise.resolve()); instance.controller.enableMusic();
  await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.controller.getSnapshot().musicError, null);
});

test("disabling during a pending play prevents late completion from restoring music", async () => {
  const instance = fixture();
  const pending = deferred(); instance.playWith(() => pending.promise);
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.setMusicEnabled(false);
  pending.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
  assert.equal(instance.controller.getSnapshot().preferences.musicEnabled, false);
  assert.ok(instance.calls.includes("pause-music"));
});

test("an earlier play settlement cannot pause or overwrite a newer enabling request", async () => {
  const instance = fixture();
  const pending = deferred(); instance.playWith(() => pending.promise);
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.setMusicEnabled(false);
  instance.playWith(() => Promise.resolve()); instance.controller.enableMusic(); await flush();
  const pauses = instance.calls.filter((call) => call === "pause-music").length;
  pending.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.calls.filter((call) => call === "pause-music").length, pauses);
});

test("hiding stops effects and pauses music, then resumes only previously active channels", async () => {
  const instance = fixture();
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("menu-open");
  instance.controller.setVisible(false);
  assert.equal(instance.controller.getSnapshot().musicStatus, "paused");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "paused");
  assert.ok(instance.calls.includes("stop-voice"));
  instance.clock(1000); instance.controller.playCue("zoom-in");
  assert.equal(instance.calls.includes("cue:zoom-in"), false);
  instance.controller.setVisible(true); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  instance.pauseUnexpectedly();
  const plays = instance.calls.filter((call) => call === "play-music").length;
  instance.controller.setVisible(false); instance.controller.setVisible(true); await flush();
  assert.equal(instance.calls.filter((call) => call === "play-music").length, plays);
});

test("a loading channel is not automatically resumed after hiding", async () => {
  const instance = fixture();
  const pending = deferred(); instance.playWith(() => pending.promise);
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.setVisible(false);
  pending.resolve(); await flush(); instance.controller.setVisible(true); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "paused");
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 1);
});

test("disabled or disposed effects abort loading and ignore its late settlement", async () => {
  const instance = fixture();
  const pending = deferred(); let signal: AbortSignal | undefined;
  instance.loadWith((next) => { signal = next; return pending.promise; });
  instance.controller.mount(); instance.controller.enableEffects(); instance.controller.setEffectsEnabled(false);
  assert.equal(signal?.aborted, true);
  pending.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "off");
  instance.controller.enableEffects(); instance.controller.dispose();
  assert.equal(signal?.aborted, true);
  instance.controller.mount(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "idle");
  assert.ok(instance.calls.includes("dispose-effects"));
});

test("effect errors stay separate from music and retry replaces the failed engine", async () => {
  const instance = fixture(); instance.loadWith(() => Promise.reject(new Error("Unavailable")));
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.enableEffects(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "error");
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  instance.loadWith(() => Promise.resolve()); instance.controller.enableEffects(); await flush();
  assert.ok(instance.calls.includes("dispose-effects"));
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("cue bursts are throttled globally, per cue and to three concurrent voices", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("menu-open");
  instance.clock(50); instance.controller.playCue("ui-select");
  instance.clock(100); instance.controller.playCue("menu-open");
  instance.clock(200); instance.controller.playCue("zoom-in");
  instance.clock(400); instance.controller.playCue("zoom-out");
  instance.clock(600); instance.controller.playCue("menu-close");
  instance.clock(800); instance.controller.playCue("ui-select");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["menu-open", "zoom-in", "menu-close"]);
  instance.voices[0].finish(); instance.controller.playCue("ui-select");
  assert.equal(instance.voices.length, 4);
  instance.controller.setEffectsVolume(0); instance.clock(1000); instance.controller.playCue("ui-select");
  assert.equal(instance.voices.length, 4);
});

test("zoom directions share one voice for the full sound, and completion permits the next gesture", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("zoom-in");
  for (const [index, time] of [120, 240, 360, 480, 600].entries()) {
    instance.clock(time); instance.controller.playCue(index % 2 ? "zoom-in" : "zoom-out");
  }
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in"]);
  assert.equal(instance.calls.includes("stop-voice"), false, "new gestures do not restart the current sound");
  instance.voices[0].finish();
  instance.clock(607); instance.controller.playCue("zoom-out");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-out"]);
});

test("ordinary UI feedback can play alongside a zoom without interrupting it", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("zoom-out");
  instance.clock(150); instance.controller.playCue("ui-select");
  instance.clock(300); instance.controller.playCue("zoom-in");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-out", "ui-select"]);
  assert.equal(instance.calls.includes("stop-voice"), false);
});

test("hidden, disabled, disposed and interrupted effects release the shared zoom slot", async () => {
  for (const stop of ["hidden", "disabled", "disposed", "interrupted"] as const) {
    const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
    instance.controller.playCue("zoom-in");
    const oldVoice = instance.voices[0];
    if (stop === "hidden") { instance.controller.setVisible(false); instance.controller.setVisible(true); }
    else if (stop === "disabled") { instance.controller.setEffectsEnabled(false); instance.controller.enableEffects(); }
    else if (stop === "disposed") { instance.controller.dispose(); instance.controller.mount(); instance.controller.enableEffects(); }
    else { instance.interruptEffects(); instance.controller.enableEffects(); }
    await flush();
    assert.ok(instance.calls.includes("stop-voice"), stop);
    instance.clock(1000); instance.controller.playCue("zoom-out");
    assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-out"], stop);
    // A delayed ended callback from the previous engine must not free a new zoom.
    oldVoice.finish(); instance.clock(1300); instance.controller.playCue("zoom-in");
    assert.equal(instance.voices.length, 2, stop);
  }
});

test("a failed effect start clears every voice and cannot poison zoom after recovery", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("zoom-in");
  instance.failEffectsPlay(true); instance.clock(150); instance.controller.playCue("ui-select");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "error");
  assert.ok(instance.calls.includes("stop-voice"));
  instance.failEffectsPlay(false); instance.controller.enableEffects(); await flush();
  instance.clock(1000); instance.controller.playCue("zoom-out");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-out"]);
  instance.failEffectsPlay(true); instance.voices[1].finish();
  instance.clock(1300); instance.controller.playCue("zoom-in");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "error");
  instance.failEffectsPlay(false); instance.controller.enableEffects(); await flush();
  instance.clock(1600); instance.controller.playCue("zoom-in");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-out", "zoom-in"]);
});

test("a synchronous ended callback does not reserve a zoom slot or leak a global voice", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.endEffectsSynchronously();
  for (const [index, time] of [0, 200, 400, 600, 800].entries()) {
    instance.clock(time); instance.controller.playCue(index % 2 ? "zoom-out" : "zoom-in");
  }
  assert.equal(instance.voices.length, 5);
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("effects interrupted by the browser stop active voices and require a fresh resume", async () => {
  const instance = fixture(); instance.controller.mount(); instance.controller.enableEffects(); await flush();
  instance.controller.playCue("ui-select"); instance.interruptEffects();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "paused");
  assert.ok(instance.calls.includes("stop-voice"));
  instance.clock(1000); instance.controller.playCue("menu-open");
  assert.equal(instance.voices.length, 1);
});

test("volume and preference failures apply safely to the current visit", async () => {
  const instance = fixture(); instance.controller.mount(); instance.storageFailure();
  instance.controller.setMusicVolume(2); instance.controller.setEffectsVolume(-2);
  instance.controller.setMusicVolume(NaN); instance.controller.setEffectsVolume(Infinity);
  assert.equal(instance.controller.getSnapshot().preferences.musicVolume, 1);
  assert.equal(instance.controller.getSnapshot().preferences.effectsVolume, 0);
  assert.equal(instance.controller.getSnapshot().preferenceError, true);
  instance.controller.enableMusic(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.ok(instance.calls.includes("music-volume:1"));
});

test("saved preference data is versioned, bounded by value and cannot introduce extra fields", () => {
  const enabled: AudioPreferences = { musicEnabled: true, effectsEnabled: true, musicVolume: 0.1, effectsVolume: 1 };
  assert.deepEqual(readAudioPreferences({ schemaVersion: 1, ...enabled, injected: "ignored" }), enabled);
  for (const input of [null, [], {}, { schemaVersion: 2, ...enabled }, { schemaVersion: 1, ...enabled, musicVolume: NaN }, { schemaVersion: 1, ...enabled, effectsVolume: -1 }]) assert.deepEqual(readAudioPreferences(input), defaultAudioPreferences);
});
