import { audioVolume, defaultAudioPreferences, readAudioPreferences } from "./preferences";
import { audioCues, type AudioCue, type AudioFailure, type AudioPorts, type AudioPreferences, type AudioSnapshot, type EffectsPort, type EffectVoice, type CameraMotion, type MusicPort } from "./types";

const initialSnapshot: AudioSnapshot = Object.freeze({ preferences: defaultAudioPreferences, musicStatus: "idle", effectsStatus: "idle", musicError: null, effectsError: null, preferenceError: false });
const failure = (error: unknown): AudioFailure => error && typeof error === "object" && "name" in error && error.name === "NotAllowedError" ? "blocked" : "load";

/** Owns intent and resources; saved preferences never grant a browser playback gesture. */
export function createAudioController(ports: AudioPorts) {
  let snapshot = initialSnapshot;
  let mounted = false;
  let visible = true;
  let music: MusicPort | null = null;
  let effects: EffectsPort | null = null;
  let musicAttempt = 0;
  let effectsAttempt = 0;
  let effectsAbort: AbortController | null = null;
  let resumeMusic = false;
  let resumeEffects = false;
  let lastCueAt = -Infinity;
  const cueTimes = new Map<AudioCue, number>();
  const voices = new Set<EffectVoice>();
  type Playback = { voice?: EffectVoice; cue: AudioCue };
  type MotionState = { playback?: Playback; timer?: unknown; revision: number };
  const motions = new Map<CameraMotion, MotionState>();
  const retiring = new Map<CameraMotion, Playback>();
  let musicGesturePending = false;
  let effectsGesturePending = false;
  let lastUnlockAt = -Infinity;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<AudioSnapshot>) => {
    snapshot = Object.freeze({ ...snapshot, ...patch });
    listeners.forEach((listener) => listener());
  };
  const persist = (patch: Partial<AudioPreferences>) => {
    const preferences = Object.freeze({ ...snapshot.preferences, ...patch });
    let preferenceError = false;
    try { ports.writePreferences(preferences); } catch { preferenceError = true; }
    publish({ preferences, preferenceError });
  };
  const cancelLease = (state: MotionState) => {
    ++state.revision;
    if (state.timer !== undefined) ports.cancel(state.timer);
    state.timer = undefined;
  };
  const stopVoices = () => {
    motions.forEach(cancelLease); motions.clear();
    const all = new Set(voices);
    retiring.forEach((ticket) => { if (ticket.voice) all.add(ticket.voice); });
    retiring.clear(); voices.clear();
    all.forEach((voice) => { try { voice.stop(); } catch { /* Already ended. */ } });
  };
  function retire(motion: CameraMotion, playback: Playback, fade: number) {
    const prior = retiring.get(motion);
    retiring.delete(motion);
    if (prior?.voice) { try { prior.voice.stop(); } catch { /* Already ended. */ } }
    if (!playback.voice) return;
    voices.delete(playback.voice);
    retiring.set(motion, playback);
    try { playback.voice.stop(fade); } catch { retiring.delete(motion); }
  }
  function stopCameraMotion(motion?: CameraMotion) {
    for (const layer of motion ? [motion] : ["zoom", "orbit"] as const) {
      const state = motions.get(layer);
      motions.delete(layer);
      if (state) {
        cancelLease(state);
        if (state.playback) retire(layer, state.playback, 0.02);
      }
    }
  }
  const effectsReady = () => mounted && visible && !snapshot.preferences.muted && snapshot.preferences.effectsEnabled && snapshot.preferences.effectsVolume > 0 && snapshot.effectsStatus === "ready" && Boolean(effects?.isRunning());
  function cameraMotion(motion: CameraMotion, direction?: "in" | "out") {
    if ((motion !== "orbit" && motion !== "zoom") || !effectsReady() || !effects) return;
    const now = ports.now();
    if (!Number.isFinite(now)) return;
    const holdSeconds = motion === "zoom" ? 0.18 : 0.12;
    const cue: AudioCue = motion === "orbit" ? "camera-orbit" : direction === "out" ? "zoom-out" : "zoom-in";
    let state = motions.get(motion);
    if (!state) { state = { revision: 0 }; motions.set(motion, state); }
    cancelLease(state);
    const owned = state;
    const revision = state.revision;
    state.timer = ports.later(() => {
      if (motions.get(motion) === owned && owned.revision === revision) stopCameraMotion(motion);
    }, holdSeconds * 1000);
    try {
      const current = state.playback;
      if (current?.voice) {
        if (current.voice.renew(holdSeconds, 0.02)) {
          if (current.cue === cue) return;
        } else {
          // The audio clock may already have stopped it while this thread was
          // blocked, before either ended or the JS lease callback could run.
          state.playback = undefined;
          voices.delete(current.voice);
          current.voice.stop();
        }
      }
      let delay = 0;
      if (state.playback?.voice) { retire(motion, state.playback, 0.008); delay = 0.008; }
      else {
        // Cancel a fading prior gesture before a new one can become audible.
        const prior = retiring.get(motion); retiring.delete(motion);
        if (prior?.voice) { prior.voice.stop(); }
        if (voices.size >= 3) {
          const occupied = [...motions.values()].map((item) => item.playback?.voice);
          const ordinary = [...voices].find((voice) => !occupied.includes(voice));
          if (ordinary) { voices.delete(ordinary); ordinary.stop(); }
        }
      }
      const playback: Playback = { cue };
      state.playback = playback;
      let ended = false;
      const voice = effects.play(cue, () => {
        ended = true;
        if (playback.voice) voices.delete(playback.voice);
        if (owned.playback === playback) owned.playback = undefined;
        if (retiring.get(motion) === playback) retiring.delete(motion);
      }, delay);
      playback.voice = voice;
      if (!ended && voice.renew(holdSeconds, 0.02)) voices.add(voice);
      else {
        owned.playback = undefined; if (!ended) voice.stop();
        motions.delete(motion); cancelLease(owned);
      }
      lastCueAt = now;
    } catch { stopVoices(); publish({ effectsStatus: "error", effectsError: "load" }); }
  }
  function startMusic(gesture = false) {
    if (!mounted || !visible || snapshot.preferences.muted || !snapshot.preferences.musicEnabled) return;
    const attempt = ++musicAttempt;
    musicGesturePending = gesture;
    try {
      if (snapshot.musicStatus === "error" && snapshot.musicError !== "blocked") { music?.dispose(); music = null; }
      if (!music) {
        const created = ports.createMusic({
          paused: () => { if (music === created && snapshot.musicStatus === "playing") publish({ musicStatus: snapshot.preferences.musicEnabled ? "paused" : "off" }); },
          failed: () => { if (music === created && !snapshot.preferences.muted && snapshot.preferences.musicEnabled) { ++musicAttempt; publish({ musicStatus: "error", musicError: "load" }); } },
        });
        music = created;
      }
      const player = music;
      player.setVolume(snapshot.preferences.musicVolume);
      publish({ musicStatus: "loading", musicError: null });
      // Invoke synchronously in the enabling click, before awaiting any asset operation.
      void player.play().then(() => {
        if (attempt !== musicAttempt || !mounted || !visible || snapshot.preferences.muted || !snapshot.preferences.musicEnabled) {
          if (music === player && (!mounted || !visible || snapshot.preferences.muted || !snapshot.preferences.musicEnabled)) player.pause();
          return;
        }
        musicGesturePending = false;
        publish({ musicStatus: "playing", musicError: null });
      }, (error: unknown) => {
        if (attempt === musicAttempt && mounted) { musicGesturePending = false; publish({ musicStatus: "error", musicError: failure(error) }); }
      });
    } catch { musicGesturePending = false; publish({ musicStatus: "error", musicError: "unavailable" }); }
  }
  function startEffects(gesture = false) {
    if (!mounted || !visible || snapshot.preferences.muted || !snapshot.preferences.effectsEnabled) return;
    const attempt = ++effectsAttempt;
    effectsGesturePending = gesture;
    effectsAbort?.abort();
    const abort = new AbortController();
    effectsAbort = abort;
    try {
      if (snapshot.effectsStatus === "error" && snapshot.effectsError !== "blocked") { stopVoices(); effects?.dispose(); effects = null; }
      if (!effects) {
        const created = ports.createEffects(() => {
          if (effects === created && snapshot.effectsStatus === "ready" && !created.isRunning()) {
            stopVoices();
            publish({ effectsStatus: "paused" });
          }
        });
        effects = created;
      }
      const engine = effects;
      engine.setVolume(snapshot.preferences.effectsVolume);
      publish({ effectsStatus: "loading", effectsError: null });
      // AudioContext.resume must run in the original gesture, before fetching/decoding.
      const unlock = engine.resume(abort.signal);
      void Promise.all([unlock, engine.load(abort.signal)]).then(() => {
        if (attempt !== effectsAttempt || !mounted || snapshot.preferences.muted || !snapshot.preferences.effectsEnabled) return;
        effectsGesturePending = false;
        publish({ effectsStatus: visible && engine.isRunning() ? "ready" : "paused", effectsError: null });
      }, (error: unknown) => {
        if (attempt === effectsAttempt && mounted && !abort.signal.aborted) {
          effectsGesturePending = false;
          abort.abort(); stopVoices(); void engine.suspend().catch(() => {});
          publish({ effectsStatus: "error", effectsError: failure(error) });
        }
      });
    } catch { effectsGesturePending = false; stopVoices(); publish({ effectsStatus: "error", effectsError: "unavailable" }); }
  }
  const setMusicEnabled = (enabled: boolean) => {
    persist({ musicEnabled: enabled });
    if (enabled) startMusic(true);
    else { ++musicAttempt; musicGesturePending = false; resumeMusic = false; music?.pause(); publish({ musicStatus: "off", musicError: null }); }
  };
  const setEffectsEnabled = (enabled: boolean) => {
    persist({ effectsEnabled: enabled });
    if (enabled) startEffects(true);
    else {
      ++effectsAttempt; effectsGesturePending = false; resumeEffects = false; effectsAbort?.abort(); stopVoices();
      void effects?.suspend().catch(() => {});
      publish({ effectsStatus: "off", effectsError: null });
    }
  };
  const setMuted = (muted: boolean) => {
    // Explicitly enabling the master control recovers an all-Off mix while
    // retaining its volumes. Ordinary gestures never alter either saved channel.
    const enableEmptyMix = !muted && !snapshot.preferences.musicEnabled && !snapshot.preferences.effectsEnabled;
    persist({ muted, ...(enableEmptyMix ? { musicEnabled: true, effectsEnabled: true } : {}) });
    if (muted) {
      ++musicAttempt; ++effectsAttempt;
      musicGesturePending = false; effectsGesturePending = false;
      resumeMusic = false; resumeEffects = false;
      effectsAbort?.abort(); effectsAbort = null;
      stopVoices(); music?.pause();
      void effects?.suspend().catch(() => {});
      publish({ musicStatus: "off", effectsStatus: "off", musicError: null, effectsError: null });
    } else {
      resumeMusic = !visible && snapshot.preferences.musicEnabled;
      resumeEffects = !visible && snapshot.preferences.effectsEnabled;
      if (visible) { startMusic(true); startEffects(true); }
      else publish({ musicStatus: snapshot.preferences.musicEnabled ? "idle" : "off", effectsStatus: snapshot.preferences.effectsEnabled ? "idle" : "off" });
    }
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    mount(initiallyVisible = true) {
      mounted = true;
      visible = initiallyVisible;
      let preferences = defaultAudioPreferences;
      let preferenceError = false;
      try { preferences = readAudioPreferences(ports.readPreferences()); }
      catch { preferenceError = true; preferences = Object.freeze({ ...defaultAudioPreferences, musicEnabled: false, effectsEnabled: false }); }
      publish({ preferences, preferenceError, musicStatus: !preferences.muted && preferences.musicEnabled ? "idle" : "off", effectsStatus: !preferences.muted && preferences.effectsEnabled ? "idle" : "off", musicError: null, effectsError: null });
      resumeMusic = !visible && !preferences.muted && preferences.musicEnabled;
      resumeEffects = !visible && !preferences.muted && preferences.effectsEnabled;
      if (visible) { startMusic(); startEffects(); }
    },
    setMusicEnabled, setEffectsEnabled, setMuted,
    enableMusic: () => setMusicEnabled(true),
    enableEffects: () => setEffectsEnabled(true),
    setMusicVolume(value: number) {
      const volume = audioVolume(value);
      if (volume === null) return;
      persist({ musicVolume: volume }); music?.setVolume(volume);
    },
    setEffectsVolume(value: number) {
      const volume = audioVolume(value);
      if (volume === null) return;
      persist({ effectsVolume: volume }); if (volume === 0) stopVoices(); effects?.setVolume(volume);
    },
    retry() {
      persist({});
      if (snapshot.preferences.musicEnabled && snapshot.musicStatus === "error" && snapshot.musicError !== "blocked") startMusic(true);
      if (snapshot.preferences.effectsEnabled && snapshot.effectsStatus === "error" && snapshot.effectsError !== "blocked") startEffects(true);
    },
    unlockFromGesture() {
      if (!mounted || !visible || snapshot.preferences.muted) return;
      const retryMusic = snapshot.preferences.musicEnabled && !musicGesturePending && snapshot.musicStatus !== "playing" && !(snapshot.musicStatus === "error" && snapshot.musicError !== "blocked");
      const retryEffects = snapshot.preferences.effectsEnabled && !effectsGesturePending && snapshot.effectsStatus !== "ready" && !(snapshot.effectsStatus === "error" && snapshot.effectsError !== "blocked");
      if (!retryMusic && !retryEffects) return;
      const now = ports.now();
      if (now - lastUnlockAt < 750) return;
      lastUnlockAt = now;
      // Both gesture-sensitive calls begin in this stack, without awaiting either.
      if (retryMusic) startMusic(true);
      if (retryEffects) startEffects(true);
    },
    cameraMotion, stopCameraMotion,
    playCue(cue: AudioCue) {
      if (cue === "zoom-in" || cue === "zoom-out" || cue === "camera-orbit") {
        cameraMotion(cue === "camera-orbit" ? "orbit" : "zoom", cue === "zoom-out" ? "out" : "in"); return;
      }
      if (!effectsReady() || !effects || !audioCues.includes(cue)) return;
      const now = ports.now();
      if (!Number.isFinite(now) || now - lastCueAt < 100 || now - (cueTimes.get(cue) ?? -Infinity) < 180 || voices.size >= 3) return;
      try {
        let ended = false;
        const playback: { voice?: EffectVoice } = {};
        const voice = effects.play(cue, () => { ended = true; if (playback.voice) voices.delete(playback.voice); });
        playback.voice = voice;
        if (!ended) voices.add(voice);
        lastCueAt = now; cueTimes.set(cue, now);
      } catch { stopVoices(); publish({ effectsStatus: "error", effectsError: "load" }); }
    },
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      if (!next) {
        resumeMusic = snapshot.musicStatus === "playing" || snapshot.musicStatus === "loading";
        resumeEffects = snapshot.effectsStatus === "ready" || snapshot.effectsStatus === "loading";
        ++musicAttempt; ++effectsAttempt; musicGesturePending = false; effectsGesturePending = false;
        effectsAbort?.abort(); music?.pause(); stopVoices();
        if (!snapshot.preferences.muted && snapshot.preferences.musicEnabled && snapshot.musicStatus !== "idle" && snapshot.musicStatus !== "error") publish({ musicStatus: "paused" });
        void effects?.suspend().catch(() => {});
        if (snapshot.preferences.effectsEnabled && (snapshot.effectsStatus === "ready" || snapshot.effectsStatus === "loading")) publish({ effectsStatus: "paused" });
      } else {
        if (resumeMusic) startMusic();
        if (resumeEffects) startEffects();
        resumeMusic = false; resumeEffects = false;
      }
    },
    dispose() {
      mounted = false; ++musicAttempt; ++effectsAttempt;
      effectsAbort?.abort(); effectsAbort = null; stopVoices();
      music?.dispose(); music = null; effects?.dispose(); effects = null;
      resumeMusic = false; resumeEffects = false; lastCueAt = -Infinity; cueTimes.clear();
      musicGesturePending = false; effectsGesturePending = false; lastUnlockAt = -Infinity;
    },
  };
}

export type AudioController = ReturnType<typeof createAudioController>;
