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
const mutedPreferences = { schemaVersion: 1, musicEnabled: false, effectsEnabled: false, musicVolume: 0.2, effectsVolume: 0.4 };

function fixture(saved: unknown = null) {
  const calls: string[] = [];
  let now = 0;
  let running = false;
  let storageFails = false;
  let readFails = false;
  let musicPlay = () => Promise.resolve();
  let effectsLoad = (signal: AbortSignal) => { void signal; return Promise.resolve(); };
  let effectsResume = () => Promise.resolve();
  let effectsPlayFails = false;
  let synchronousEnd = false;
  let deferredStopEnd = false;
  let musicEvents: Parameters<AudioPorts["createMusic"]>[0] | undefined;
  let interrupted: (() => void) | undefined;
  type Voice = { cue: AudioCue; stop(fadeSeconds?: number): void; finish(): void; stopFades: (number | undefined)[] };
  const voices: Voice[] = [];
  const liveVoices = new Set<Voice>();
  const ports: AudioPorts = {
    readPreferences: () => { calls.push("read-preferences"); if (readFails) throw new Error("Unavailable"); return saved; },
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
          const voice: Voice = {
            cue, stopFades: [],
            stop(fadeSeconds) {
              calls.push("stop-voice"); voice.stopFades.push(fadeSeconds); liveVoices.delete(voice);
              if (!deferredStopEnd) ended();
            },
            finish() { liveVoices.delete(voice); ended(); },
          };
          voices.push(voice);
          liveVoices.add(voice);
          if (synchronousEnd) voice.finish();
          return voice;
        },
      };
    },
  };
  const controller = createAudioController(ports);
  return {
    controller, calls, voices, liveVoices,
    get saved() { return saved; },
    clock(value: number) { now = value; },
    storageFailure() { storageFails = true; },
    readFailure() { readFails = true; },
    playWith(operation: () => Promise<void>) { musicPlay = operation; },
    loadWith(operation: (signal: AbortSignal) => Promise<void>) { effectsLoad = operation; },
    resumeWith(operation: () => Promise<void>) { effectsResume = operation; },
    pauseUnexpectedly() { musicEvents?.paused(); },
    interruptEffects() { running = false; interrupted?.(); },
    failEffectsPlay(value: boolean) { effectsPlayFails = value; },
    endEffectsSynchronously() { synchronousEnd = true; },
    delayStopEnds() { deferredStopEnd = true; },
  };
}

test("default and saved enabled preferences are read before attempting visible playback", async () => {
  for (const saved of [null, { schemaVersion: 1, musicEnabled: true, effectsEnabled: true, musicVolume: 0.2, effectsVolume: 0.4 }]) {
    const { controller, calls } = fixture(saved);
    assert.deepEqual(controller.getServerSnapshot().preferences, defaultAudioPreferences);
    assert.equal(calls.length, 0);
    controller.mount();
    assert.equal(calls[0], "read-preferences");
    assert.equal(calls.includes("persist"), false, "mount does not rewrite saved preferences");
    assert.equal(controller.getSnapshot().preferences.musicEnabled, true);
    assert.equal(controller.getSnapshot().preferences.effectsEnabled, true);
    assert.equal(controller.getSnapshot().musicStatus, "loading");
    assert.equal(controller.getSnapshot().effectsStatus, "loading");
    await flush();
    assert.equal(controller.getSnapshot().musicStatus, "playing");
    assert.equal(controller.getSnapshot().effectsStatus, "ready");
    controller.dispose();
  }
});

test("enabling invokes gesture-sensitive play/resume before asynchronous loading", async () => {
  const { controller, calls } = fixture(mutedPreferences);
  controller.mount(); controller.enableMusic(); controller.enableEffects();
  assert.ok(calls.includes("play-music"));
  assert.ok(calls.indexOf("resume-effects") < calls.indexOf("load-effects"));
  assert.equal(controller.getSnapshot().musicStatus, "loading");
  await flush();
  assert.equal(controller.getSnapshot().musicStatus, "playing");
  assert.equal(controller.getSnapshot().effectsStatus, "ready");
});

test("saved mute choices remain off across gestures, visibility changes and a fresh controller", async () => {
  const instance = fixture(mutedPreferences);
  instance.controller.mount();
  for (const time of [0, 800, 1600]) { instance.clock(time); instance.controller.unlockFromGesture(); }
  instance.controller.setVisible(false); instance.controller.setVisible(true);
  await flush();
  assert.deepEqual(instance.calls, ["read-preferences"]);
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "off");
  assert.deepEqual(instance.saved, mutedPreferences);
  instance.controller.dispose();
  const refreshed = fixture(instance.saved);
  refreshed.controller.mount(); refreshed.controller.unlockFromGesture(); await flush();
  assert.deepEqual(refreshed.calls, ["read-preferences"]);
  assert.equal(refreshed.controller.getSnapshot().preferences.musicEnabled, false);
  assert.equal(refreshed.controller.getSnapshot().preferences.effectsEnabled, false);
});

test("mixed preferences apply before resources exist and explicit enable persists before starting", async () => {
  const instance = fixture({ ...mutedPreferences, effectsEnabled: true });
  instance.controller.mount(); await flush();
  assert.equal(instance.calls.includes("create-music"), false);
  assert.ok(instance.calls.includes("effects-volume:0.4"));
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  instance.calls.length = 0;
  instance.controller.enableMusic();
  assert.ok(instance.calls.indexOf("persist") < instance.calls.indexOf("create-music"));
  assert.ok(instance.calls.includes("music-volume:0.2"));
  await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.deepEqual(instance.saved, { ...mutedPreferences, musicEnabled: true, effectsEnabled: true });
});

test("mounting a hidden document allocates nothing until it becomes visible", async () => {
  const instance = fixture();
  instance.controller.mount(false); instance.controller.unlockFromGesture();
  assert.deepEqual(instance.calls, ["read-preferences"]);
  assert.equal(instance.controller.getSnapshot().musicStatus, "idle");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "idle");
  instance.controller.setVisible(true); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 1);
  assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 1);
});

test("the first gesture starts both channels synchronously even while automatic attempts are pending", async () => {
  const instance = fixture();
  const oldMusic = deferred(); const newMusic = deferred();
  const oldEffects = deferred(); const newEffects = deferred();
  let musicAttempt = 0; let effectsAttempt = 0;
  const signals: AbortSignal[] = [];
  instance.playWith(() => musicAttempt++ === 0 ? oldMusic.promise : newMusic.promise);
  instance.resumeWith(() => effectsAttempt++ === 0 ? oldEffects.promise : newEffects.promise);
  instance.loadWith((signal) => { signals.push(signal); return Promise.resolve(); });
  instance.controller.mount();
  assert.equal(musicAttempt, 1); assert.equal(effectsAttempt, 1);
  instance.controller.unlockFromGesture();
  assert.equal(musicAttempt, 2, "music play runs before the gesture call returns");
  assert.equal(effectsAttempt, 2, "effects resume runs in the same gesture stack");
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  for (const time of [10, 100, 749, 750, 1500, 3000]) {
    instance.clock(time); instance.controller.unlockFromGesture();
  }
  assert.equal(musicAttempt, 2, "pending gesture work is not restarted by repeated input");
  assert.equal(effectsAttempt, 2);
  oldMusic.resolve(); oldEffects.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "loading");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "loading");
  newMusic.resolve(); newEffects.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("blocked autoplay waits for a gesture and does not create a retry storm", async () => {
  const instance = fixture();
  const blocked = () => Promise.reject(Object.assign(new Error("Blocked"), { name: "NotAllowedError" }));
  instance.playWith(blocked); instance.resumeWith(blocked);
  instance.controller.mount(); await flush();
  assert.equal(instance.controller.getSnapshot().musicError, "blocked");
  assert.equal(instance.controller.getSnapshot().effectsError, "blocked");
  instance.controller.retry(); await flush();
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 1);
  assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 1);
  instance.controller.unlockFromGesture(); await flush();
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 2);
  assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 2);
  for (const time of [50, 100, 749]) { instance.clock(time); instance.controller.unlockFromGesture(); }
  await flush();
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 2);
  assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 2);
  instance.playWith(() => Promise.resolve()); instance.resumeWith(() => Promise.resolve());
  instance.clock(750); instance.controller.unlockFromGesture(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("real load and unavailable failures require explicit Retry rather than ordinary gestures", async () => {
  for (const errorKind of ["load", "unavailable"] as const) {
    const instance = fixture();
    const fail = () => {
      if (errorKind === "unavailable") throw new Error("Synthetic unavailable audio");
      return Promise.reject(new Error("Synthetic network failure"));
    };
    instance.playWith(fail); instance.resumeWith(fail);
    instance.controller.mount(); await flush();
    assert.equal(instance.controller.getSnapshot().musicError, errorKind);
    assert.equal(instance.controller.getSnapshot().effectsError, errorKind);
    for (const time of [0, 800, 2000]) { instance.clock(time); instance.controller.unlockFromGesture(); }
    await flush();
    assert.equal(instance.calls.filter((call) => call === "play-music").length, 1);
    assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 1);
    instance.playWith(() => Promise.resolve()); instance.resumeWith(() => Promise.resolve());
    instance.controller.retry(); await flush();
    assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
    assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
    assert.ok(instance.calls.includes("dispose-music"));
    assert.ok(instance.calls.includes("dispose-effects"));
  }
});

test("unreadable saved preferences conservatively stay off until an explicit enable", async () => {
  const instance = fixture(); instance.readFailure();
  instance.controller.mount(); instance.controller.unlockFromGesture(); await flush();
  assert.deepEqual(instance.calls, ["read-preferences"]);
  assert.equal(instance.controller.getSnapshot().preferenceError, true);
  assert.equal(instance.controller.getSnapshot().preferences.musicEnabled, false);
  assert.equal(instance.controller.getSnapshot().preferences.effectsEnabled, false);
  instance.controller.enableEffects(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
});

test("muting pending defaults persists off and late completions or gestures cannot undo it", async () => {
  const instance = fixture(); const pending = deferred();
  instance.playWith(() => pending.promise); instance.resumeWith(() => pending.promise);
  instance.controller.mount();
  instance.controller.setMusicEnabled(false); instance.controller.setEffectsEnabled(false);
  pending.resolve(); await flush();
  instance.clock(1000); instance.controller.unlockFromGesture();
  instance.controller.setVisible(false); instance.controller.setVisible(true); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
  assert.equal(instance.controller.getSnapshot().effectsStatus, "off");
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 1);
  assert.equal(instance.calls.filter((call) => call === "resume-effects").length, 1);
  const refreshed = fixture(instance.saved); refreshed.controller.mount(); refreshed.controller.unlockFromGesture();
  assert.deepEqual(refreshed.calls, ["read-preferences"]);
  assert.equal(refreshed.controller.getSnapshot().preferences.musicEnabled, false);
  assert.equal(refreshed.controller.getSnapshot().preferences.effectsEnabled, false);
});

test("rejected autoplay is an honest recoverable error and does not disable the other channel", async () => {
  const instance = fixture(mutedPreferences);
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
  const instance = fixture(mutedPreferences);
  const pending = deferred(); instance.playWith(() => pending.promise);
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.setMusicEnabled(false);
  pending.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "off");
  assert.equal(instance.controller.getSnapshot().preferences.musicEnabled, false);
  assert.ok(instance.calls.includes("pause-music"));
});

test("an earlier play settlement cannot pause or overwrite a newer enabling request", async () => {
  const instance = fixture(mutedPreferences);
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
  instance.controller.mount(); await flush();
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

test("a loading channel resumes after visibility returns without accepting its old settlement", async () => {
  const instance = fixture(mutedPreferences);
  const pending = deferred(); instance.playWith(() => pending.promise);
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.setVisible(false);
  pending.resolve(); await flush(); instance.controller.setVisible(true); await flush();
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  assert.equal(instance.calls.filter((call) => call === "play-music").length, 2);
});

test("disabled or disposed effects abort loading and ignore its late settlement", async () => {
  const instance = fixture(mutedPreferences);
  const pending = deferred(); let signal: AbortSignal | undefined;
  instance.loadWith((next) => { signal = next; return pending.promise; });
  instance.controller.mount(); instance.controller.enableEffects(); instance.controller.setEffectsEnabled(false);
  assert.equal(signal?.aborted, true);
  pending.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "off");
  instance.controller.enableEffects(); instance.controller.dispose();
  assert.equal(signal?.aborted, true);
  instance.controller.mount(false); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "idle");
  assert.ok(instance.calls.includes("dispose-effects"));
});

test("effect errors stay separate from music and retry replaces the failed engine", async () => {
  const instance = fixture(mutedPreferences); instance.loadWith(() => Promise.reject(new Error("Unavailable")));
  instance.controller.mount(); instance.controller.enableMusic(); instance.controller.enableEffects(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "error");
  assert.equal(instance.controller.getSnapshot().musicStatus, "playing");
  instance.loadWith(() => Promise.resolve()); instance.controller.enableEffects(); await flush();
  assert.ok(instance.calls.includes("dispose-effects"));
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("ordinary UI cue bursts keep their global and per-cue cooldowns and three-voice cap", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.controller.playCue("menu-open");
  instance.clock(50); instance.controller.playCue("ui-select");
  instance.clock(100); instance.controller.playCue("menu-open");
  instance.clock(200); instance.controller.playCue("ui-select");
  instance.clock(400); instance.controller.playCue("menu-close");
  instance.clock(600); instance.controller.playCue("menu-open");
  instance.clock(800); instance.controller.playCue("ui-select");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["menu-open", "ui-select", "menu-close"]);
  assert.equal(instance.liveVoices.size, 3);
  instance.voices[0].finish(); instance.controller.playCue("ui-select");
  assert.equal(instance.voices.length, 4);
  assert.equal(instance.liveVoices.size, 3);
  instance.controller.setEffectsVolume(0); instance.clock(1000); instance.controller.playCue("ui-select");
  assert.equal(instance.voices.length, 4);
});

test("continuous zoom feedback replaces its previous voice with a short fade instead of going silent", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.delayStopEnds();
  for (const time of [0, 500, 1000, 1500]) {
    instance.clock(time); instance.controller.playCue("zoom-in");
    assert.equal(instance.liveVoices.size, 1);
    assert.equal([...instance.liveVoices][0], instance.voices.at(-1));
  }
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-in", "zoom-in", "zoom-in"]);
  for (const voice of instance.voices.slice(0, -1)) assert.deepEqual(voice.stopFades, [0.008]);
  for (const voice of instance.voices.slice(0, -1)) voice.finish();
  assert.equal(instance.liveVoices.size, 1, "late end notifications do not release the replacement");
  instance.voices.at(-1)!.finish();
  instance.clock(2000); instance.controller.playCue("zoom-out");
  assert.equal(instance.voices.at(-1)!.cue, "zoom-out");
  assert.equal(instance.liveVoices.size, 1);
});

test("reversing zoom after 120 ms replaces the old direction without waiting for its sound to end", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.controller.playCue("zoom-in");
  instance.clock(120); instance.controller.playCue("zoom-out");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-in", "zoom-out"]);
  assert.deepEqual(instance.voices[0].stopFades, [0.008]);
  assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["zoom-out"]);
});

test("zoom bypasses a recent UI cue while its own 100 ms gate bounds raw gesture bursts", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.controller.playCue("ui-select");
  instance.clock(10); instance.controller.playCue("zoom-in");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["ui-select", "zoom-in"]);
  for (let time = 25; time <= 310; time += 15) {
    instance.clock(time); instance.controller.playCue("zoom-in");
    assert.equal([...instance.liveVoices].filter((voice) => voice.cue.startsWith("zoom-")).length, 1);
    assert.ok(instance.liveVoices.size <= 3);
  }
  assert.equal(instance.voices.filter((voice) => voice.cue === "zoom-in").length, 3);
  instance.clock(1000); await flush();
  assert.equal(instance.voices.length, 4, "rejected raw input is never replayed from a queue");
  instance.controller.playCue("zoom-out");
  assert.equal(instance.voices.at(-1)!.cue, "zoom-out");
  assert.equal(instance.liveVoices.size, 2);
});

test("zoom admits priority feedback at the voice cap by fading only the oldest active voice", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.delayStopEnds();
  instance.controller.playCue("menu-open");
  instance.clock(200); instance.controller.playCue("ui-select");
  instance.clock(400); instance.controller.playCue("menu-close");
  assert.equal(instance.liveVoices.size, 3);
  instance.clock(410); instance.controller.playCue("zoom-in");
  assert.equal(instance.liveVoices.size, 3);
  assert.deepEqual(instance.voices[0].stopFades, [0.008]);
  assert.deepEqual(instance.voices[1].stopFades, []);
  assert.deepEqual(instance.voices[2].stopFades, []);
  assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["ui-select", "menu-close", "zoom-in"]);
  instance.voices[0].finish();
  instance.clock(800); instance.controller.playCue("menu-open");
  assert.equal(instance.voices.length, 4, "the evicted voice's late end cannot free another voice's budget");
});

test("ordinary UI feedback can play alongside zoom replacements without being interrupted", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.controller.playCue("zoom-out");
  instance.clock(150); instance.controller.playCue("ui-select");
  instance.clock(300); instance.controller.playCue("zoom-in");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["zoom-out", "ui-select", "zoom-in"]);
  assert.deepEqual(instance.voices[0].stopFades, [0.008]);
  assert.deepEqual(instance.voices[1].stopFades, []);
  assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["ui-select", "zoom-in"]);
});

test("orbit feedback bypasses recent UI and replaces only its own layer every 1500 ms", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.delayStopEnds();
  instance.controller.playCue("ui-select");
  instance.clock(10); instance.controller.playCue("camera-orbit");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["ui-select", "camera-orbit"]);
  instance.clock(1510); instance.controller.playCue("camera-orbit");
  assert.deepEqual(instance.voices[0].stopFades, []);
  assert.deepEqual(instance.voices[1].stopFades, [0.008]);
  assert.equal([...instance.liveVoices].filter((voice) => voice.cue === "camera-orbit").length, 1);
  instance.voices[1].finish();
  instance.clock(3010); instance.controller.playCue("camera-orbit");
  assert.deepEqual(instance.voices[2].stopFades, [0.008], "a stale end must not orphan the current orbit layer");
  assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["ui-select", "camera-orbit"]);
  instance.controller.dispose();
  assert.equal(instance.liveVoices.size, 0);
});

test("zoom and orbit coexist while movement priority evicts UI instead of the other movement layer", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.delayStopEnds();
  instance.controller.playCue("camera-orbit");
  instance.clock(200); instance.controller.playCue("ui-select");
  instance.clock(400); instance.controller.playCue("menu-open");
  instance.clock(410); instance.controller.playCue("zoom-in");
  assert.equal(instance.liveVoices.size, 3);
  assert.deepEqual(instance.voices[0].stopFades, [], "the older orbit layer keeps playing");
  assert.deepEqual(instance.voices[1].stopFades, [0.008], "priority evicts the oldest UI voice");
  assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["camera-orbit", "menu-open", "zoom-in"]);
  instance.clock(560); instance.controller.playCue("camera-orbit");
  assert.deepEqual(instance.voices[0].stopFades, [0.008]);
  assert.deepEqual(instance.voices[3].stopFades, [], "replacing orbit leaves zoom intact");
  instance.clock(710); instance.controller.playCue("zoom-out");
  assert.deepEqual(instance.voices[3].stopFades, [0.008]);
  assert.deepEqual(instance.voices[4].stopFades, [], "replacing zoom leaves orbit intact");
  instance.voices[0].finish(); instance.voices[3].finish();
  instance.clock(860); instance.controller.playCue("camera-orbit");
  instance.clock(1010); instance.controller.playCue("zoom-in");
  assert.deepEqual(instance.voices[4].stopFades, [0.008]);
  assert.deepEqual(instance.voices[5].stopFades, [0.008]);
  assert.equal(instance.liveVoices.size, 3);
  assert.equal([...instance.liveVoices].filter((voice) => voice.cue === "camera-orbit").length, 1);
  assert.equal([...instance.liveVoices].filter((voice) => voice.cue.startsWith("zoom-")).length, 1);
  assert.deepEqual(instance.voices[2].stopFades, [], "the remaining UI voice is not interrupted by layer replacements");
});

test("orbit input received while effects load is discarded rather than replayed when ready", async () => {
  const instance = fixture(); const loading = deferred();
  instance.loadWith(() => loading.promise);
  instance.controller.mount();
  instance.controller.playCue("camera-orbit");
  instance.clock(500); instance.controller.playCue("camera-orbit");
  assert.equal(instance.voices.length, 0);
  loading.resolve(); await flush();
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
  assert.equal(instance.voices.length, 0);
  instance.clock(1000); instance.controller.playCue("camera-orbit");
  assert.deepEqual(instance.voices.map((voice) => voice.cue), ["camera-orbit"]);
  instance.controller.dispose();
  assert.equal(instance.liveVoices.size, 0);
});

test("hidden, disabled, disposed and interrupted effects release the shared zoom slot", async () => {
  for (const stop of ["hidden", "disabled", "disposed", "interrupted"] as const) {
    const instance = fixture(); instance.controller.mount(); await flush();
    instance.delayStopEnds();
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
    // A delayed ended callback must not orphan the replacement when direction changes again.
    oldVoice.finish(); instance.clock(1120); instance.controller.playCue("zoom-in");
    assert.equal(instance.voices.length, 3, stop);
    assert.deepEqual(instance.voices[1].stopFades, [0.008], stop);
    assert.deepEqual([...instance.liveVoices].map((voice) => voice.cue), ["zoom-in"], stop);
  }
});

test("muted, disabled, hidden and disposed movement input is discarded instead of queued for recovery", async () => {
  for (const cue of ["zoom-in", "camera-orbit"] as const) for (const guard of ["muted", "disabled", "hidden", "disposed"] as const) {
    const instance = fixture(); instance.controller.mount(); await flush();
    instance.controller.playCue(cue);
    if (guard === "muted") { instance.controller.setEffectsVolume(0); instance.voices[0].finish(); }
    else if (guard === "disabled") instance.controller.setEffectsEnabled(false);
    else if (guard === "hidden") instance.controller.setVisible(false);
    else instance.controller.dispose();
    for (const time of [120, 500, 1000]) { instance.clock(time); instance.controller.playCue(cue); }
    assert.equal(instance.voices.length, 1, guard);
    assert.equal(instance.liveVoices.size, 0, guard);
    if (guard === "muted") instance.controller.setEffectsVolume(0.5);
    else if (guard === "disabled") instance.controller.enableEffects();
    else if (guard === "hidden") instance.controller.setVisible(true);
    else instance.controller.mount();
    await flush();
    assert.equal(instance.voices.length, 1, `${guard}: restoring audio must not replay old input`);
    instance.clock(2000); instance.controller.playCue(cue);
    assert.equal(instance.voices.length, 2, guard);
    assert.equal(instance.liveVoices.size, 1, guard);
    instance.controller.dispose();
    assert.equal(instance.liveVoices.size, 0, guard);
  }
});

test("a failed effect start clears every voice and cannot poison zoom after recovery", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
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
  const instance = fixture(); instance.controller.mount(); await flush();
  instance.endEffectsSynchronously();
  for (const [index, time] of [0, 200, 400, 600, 800].entries()) {
    instance.clock(time); instance.controller.playCue(index % 2 ? "zoom-out" : "zoom-in");
  }
  assert.equal(instance.voices.length, 5);
  assert.equal(instance.controller.getSnapshot().effectsStatus, "ready");
});

test("effects interrupted by the browser stop active voices and require a fresh resume", async () => {
  const instance = fixture(); instance.controller.mount(); await flush();
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
