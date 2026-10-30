import { audioVolume, defaultAudioPreferences, readAudioPreferences } from "./preferences";
import { audioCues, type AudioCue, type AudioFailure, type AudioPorts, type AudioPreferences, type AudioSnapshot, type EffectsPort, type MusicPort } from "./types";

const initialSnapshot: AudioSnapshot = Object.freeze({ preferences: defaultAudioPreferences, musicStatus: "off", effectsStatus: "off", musicError: null, effectsError: null, preferenceError: false });
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
  const voices = new Set<{ stop(): void }>();
  let zoomVoice: object | null = null;
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
    zoomVoice = null;
  };
  function startMusic() {
    if (!mounted || !visible || !snapshot.preferences.musicEnabled) return;
    const attempt = ++musicAttempt;
    try {
      if (snapshot.musicStatus === "error") { music?.dispose(); music = null; }
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
        publish({ musicStatus: "playing", musicError: null });
      }, (error: unknown) => {
        if (attempt === musicAttempt && mounted) publish({ musicStatus: "error", musicError: failure(error) });
      });
    } catch { publish({ musicStatus: "error", musicError: "unavailable" }); }
  }
  function startEffects() {
    if (!mounted || !visible || !snapshot.preferences.effectsEnabled) return;
    const attempt = ++effectsAttempt;
    effectsAbort?.abort();
    const abort = new AbortController();
    effectsAbort = abort;
    try {
      if (snapshot.effectsStatus === "error") { stopVoices(); effects?.dispose(); effects = null; }
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
        publish({ effectsStatus: visible && engine.isRunning() ? "ready" : "paused", effectsError: null });
      }, (error: unknown) => {
        if (attempt === effectsAttempt && mounted && !abort.signal.aborted) {
          abort.abort(); stopVoices(); void engine.suspend().catch(() => {});
          publish({ effectsStatus: "error", effectsError: failure(error) });
        }
      });
    } catch { stopVoices(); publish({ effectsStatus: "error", effectsError: "unavailable" }); }
  }
  const setMusicEnabled = (enabled: boolean) => {
    persist({ musicEnabled: enabled });
    if (enabled) startMusic();
    else { ++musicAttempt; resumeMusic = false; music?.pause(); publish({ musicStatus: "off", musicError: null }); }
  };
  const setEffectsEnabled = (enabled: boolean) => {
    persist({ effectsEnabled: enabled });
    if (enabled) startEffects();
    else {
      ++effectsAttempt; resumeEffects = false; effectsAbort?.abort(); stopVoices();
      void effects?.suspend().catch(() => {});
      publish({ effectsStatus: "off", effectsError: null });
    }
  };
  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    mount() {
      mounted = true;
      let preferences = defaultAudioPreferences;
      let preferenceError = false;
      try { preferences = readAudioPreferences(ports.readPreferences()); } catch { preferenceError = true; }
      publish({ preferences, preferenceError, musicStatus: preferences.musicEnabled ? "idle" : "off", effectsStatus: preferences.effectsEnabled ? "idle" : "off", musicError: null, effectsError: null });
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
      if (snapshot.preferences.musicEnabled) startMusic();
      if (snapshot.preferences.effectsEnabled) startEffects();
    },
    playCue(cue: AudioCue) {
      if (!mounted || !visible || !audioCues.includes(cue) || !snapshot.preferences.effectsEnabled || snapshot.preferences.effectsVolume <= 0 || snapshot.effectsStatus !== "ready" || !effects?.isRunning()) return;
      const zoom = cue === "zoom-in" || cue === "zoom-out";
      // A gesture reversal must not stack or restart the current zoom sound.
      if (zoom && zoomVoice) return;
      const now = ports.now();
      if (now - lastCueAt < 100 || now - (cueTimes.get(cue) ?? -Infinity) < 180 || voices.size >= 3) return;
      try {
        let ended = false;
        const playback: { voice?: { stop(): void } } = {};
        if (zoom) zoomVoice = playback;
        const voice = effects.play(cue, () => {
          ended = true;
          if (playback.voice) voices.delete(playback.voice);
          if (zoomVoice === playback) zoomVoice = null;
        });
        playback.voice = voice;
        if (!ended) voices.add(voice);
        lastCueAt = now; cueTimes.set(cue, now);
      } catch { stopVoices(); publish({ effectsStatus: "error", effectsError: "load" }); }
    },
    setVisible(next: boolean) {
      if (visible === next) return;
      visible = next;
      if (!next) {
        resumeMusic = snapshot.musicStatus === "playing";
        resumeEffects = snapshot.effectsStatus === "ready" && Boolean(effects?.isRunning());
        ++musicAttempt; music?.pause(); stopVoices();
        if (snapshot.preferences.musicEnabled && snapshot.musicStatus !== "idle" && snapshot.musicStatus !== "error") publish({ musicStatus: "paused" });
        void effects?.suspend().catch(() => {});
        if (snapshot.preferences.effectsEnabled && snapshot.effectsStatus === "ready") publish({ effectsStatus: "paused" });
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
    },
  };
}

export type AudioController = ReturnType<typeof createAudioController>;
