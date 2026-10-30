import { audioVolume, defaultAudioPreferences, readAudioPreferences } from "./preferences";
import { audioCues, type AudioCue, type AudioFailure, type AudioPorts, type AudioPreferences, type AudioSnapshot, type EffectsPort, type EffectVoice, type MusicPort } from "./types";

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
  const movementVoices = new Map<"zoom" | "orbit", { voice?: EffectVoice }>();
  const movementTimes = new Map<"zoom" | "orbit", number>();
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
  const stopVoices = () => {
    voices.forEach((voice) => { try { voice.stop(); } catch { /* Already ended. */ } });
    voices.clear();
    movementVoices.clear(); movementTimes.clear();
  };
  function startMusic(gesture = false) {
    if (!mounted || !visible || !snapshot.preferences.musicEnabled) return;
    const attempt = ++musicAttempt;
    musicGesturePending = gesture;
    try {
      if (snapshot.musicStatus === "error" && snapshot.musicError !== "blocked") { music?.dispose(); music = null; }
      if (!music) {
        const created = ports.createMusic({
          paused: () => { if (music === created && snapshot.musicStatus === "playing") publish({ musicStatus: snapshot.preferences.musicEnabled ? "paused" : "off" }); },
          failed: () => { if (music === created && snapshot.preferences.musicEnabled) { ++musicAttempt; publish({ musicStatus: "error", musicError: "load" }); } },
        });
        music = created;
      }
      const player = music;
      player.setVolume(snapshot.preferences.musicVolume);
      publish({ musicStatus: "loading", musicError: null });
      // Invoke synchronously in the enabling click, before awaiting any asset operation.
      void player.play().then(() => {
        if (attempt !== musicAttempt || !mounted || !visible || !snapshot.preferences.musicEnabled) {
          if (music === player && (!mounted || !visible || !snapshot.preferences.musicEnabled)) player.pause();
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
    if (!mounted || !visible || !snapshot.preferences.effectsEnabled) return;
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
        if (attempt !== effectsAttempt || !mounted || !snapshot.preferences.effectsEnabled) return;
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
      publish({ preferences, preferenceError, musicStatus: preferences.musicEnabled ? "idle" : "off", effectsStatus: preferences.effectsEnabled ? "idle" : "off", musicError: null, effectsError: null });
      resumeMusic = !visible && preferences.musicEnabled;
      resumeEffects = !visible && preferences.effectsEnabled;
      if (visible) { startMusic(); startEffects(); }
    },
    setMusicEnabled, setEffectsEnabled,
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
      persist({ effectsVolume: volume }); effects?.setVolume(volume);
    },
    retry() {
      persist({});
      if (snapshot.preferences.musicEnabled && snapshot.musicStatus === "error" && snapshot.musicError !== "blocked") startMusic(true);
      if (snapshot.preferences.effectsEnabled && snapshot.effectsStatus === "error" && snapshot.effectsError !== "blocked") startEffects(true);
    },
    unlockFromGesture() {
      if (!mounted || !visible) return;
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
    playCue(cue: AudioCue) {
      if (!mounted || !visible || !audioCues.includes(cue) || !snapshot.preferences.effectsEnabled || snapshot.preferences.effectsVolume <= 0 || snapshot.effectsStatus !== "ready" || !effects?.isRunning()) return;
      const zoom = cue === "zoom-in" || cue === "zoom-out";
      const movement = zoom ? "zoom" : cue === "camera-orbit" ? "orbit" : null;
      const now = ports.now();
      if (!Number.isFinite(now)) return;
      const lastMovementAt = movement ? movementTimes.get(movement) ?? -Infinity : -Infinity;
      if (movement) { if (now >= lastMovementAt && now - lastMovementAt < 100) return; }
      else if (now - lastCueAt < 100 || now - (cueTimes.get(cue) ?? -Infinity) < 180 || voices.size >= 3) return;
      try {
        let delaySeconds = 0;
        if (movement) {
          // Camera movement owns one replaceable layer per gesture kind. UI cues
          // cannot mask it, and priority eviction preserves the other movement layer.
          const occupied = [...movementVoices.values()].map((ticket) => ticket.voice);
          const previous = movementVoices.get(movement)?.voice ?? (voices.size >= 3 ? [...voices].find((voice) => !occupied.includes(voice)) : undefined);
          if (previous) {
            voices.delete(previous);
            previous.stop(0.008);
            delaySeconds = 0.008;
          }
        }
        let ended = false;
        const playback: { voice?: EffectVoice } = {};
        if (movement) movementVoices.set(movement, playback);
        const voice = effects.play(cue, () => {
          ended = true;
          if (playback.voice) voices.delete(playback.voice);
          if (movement && movementVoices.get(movement) === playback) movementVoices.delete(movement);
        }, delaySeconds);
        playback.voice = voice;
        if (!ended) voices.add(voice);
        lastCueAt = now; cueTimes.set(cue, now);
        if (movement) movementTimes.set(movement, now);
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
        if (snapshot.preferences.musicEnabled && snapshot.musicStatus !== "idle" && snapshot.musicStatus !== "error") publish({ musicStatus: "paused" });
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
