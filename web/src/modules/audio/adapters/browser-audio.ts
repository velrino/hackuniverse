import { audioCues, type AudioCue, type AudioPorts } from "../domain/types";

const preferencesKey = "hackuniverse.audio.v1";
const musicUrl = "/audio/music/open-skies-loop.mp3";
const maxEffectBytes = 512 * 1024;
const assetTimeoutMs = 15_000;
type LegacyAudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
const browserAudioContext = () => {
  const Context = window.AudioContext ?? (window as LegacyAudioWindow).webkitAudioContext;
  if (!Context) throw new Error("Audio is unavailable");
  return new Context();
};

function resumeContext(context: AudioContext, signal: AbortSignal, isCurrent: () => boolean): Promise<void> {
  // Invoke resume before constructing any asynchronous continuation; preserve the gesture.
  const resuming = context.resume();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (error?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer); signal.removeEventListener("abort", abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new DOMException("Audio cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error("Audio activation timed out")), assetTimeoutMs);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    void resuming.then(() => {
      if (settled) {
        if (isCurrent() && context.state !== "closed") void context.suspend().catch(() => {});
      } else finish();
    }, finish);
  });
}

/** Browser capabilities are resolved only on mount or an explicit enabling gesture. */
export function createBrowserAudioPorts(): AudioPorts {
  return {
    now: () => performance.now(),
    readPreferences() {
      const value = window.localStorage.getItem(preferencesKey);
      if (value === null) return null;
      if (value.length > 1024) throw new Error("Invalid audio preferences");
      try { return JSON.parse(value); } catch { return null; }
    },
    writePreferences(preferences) { window.localStorage.setItem(preferencesKey, JSON.stringify({ schemaVersion: 1, ...preferences })); },
    createMusic(events) {
      const player = new Audio();
      player.preload = "none";
      player.loop = true;
      player.src = musicUrl;
      // Gain controls work on mobile browsers that keep HTMLMediaElement.volume fixed.
      // The track remains streamed by the media element; it is never decoded as a full buffer.
      const context = browserAudioContext();
      const source = context.createMediaElementSource(player);
      const gain = context.createGain();
      source.connect(gain); gain.connect(context.destination);
      let cancelPlay: (() => void) | undefined;
      let disposed = false;
      const interrupted = () => { if (context.state !== "running") events.paused(); };
      player.addEventListener("pause", events.paused);
      player.addEventListener("error", events.failed);
      context.addEventListener("statechange", interrupted);
      return {
        play() {
          cancelPlay?.();
          if (disposed) return Promise.reject(new Error("Audio is unavailable"));
          if (player.error) player.load();
          // Both gesture-sensitive APIs run before the first asynchronous boundary.
          const resume = context.resume();
          const play = player.play();
          return new Promise<void>((resolve, reject) => {
            let settled = false;
            const finish = (error?: unknown) => {
              if (settled) return;
              settled = true; clearTimeout(timer); cancelPlay = undefined;
              if (error) { player.pause(); void context.suspend().catch(() => {}); reject(error); }
              else resolve();
            };
            const timer = setTimeout(() => finish(new Error("Music playback timed out")), assetTimeoutMs);
            cancelPlay = () => finish(new DOMException("Playback cancelled", "AbortError"));
            // A delayed resume must not reactivate a context after timeout/cancel.
            void resume.then(() => { if (settled && player.paused && context.state !== "closed") void context.suspend().catch(() => {}); }, () => {});
            void Promise.all([resume, play]).then(() => {
              if (context.state !== "running" || player.paused) finish(new Error("Music is not playing"));
              else finish();
            }, finish);
          });
        },
        pause() { cancelPlay?.(); player.pause(); void context.suspend().catch(() => {}); },
        setVolume: (volume) => { gain.gain.setTargetAtTime(volume, context.currentTime, 0.015); },
        dispose() {
          disposed = true; cancelPlay?.();
          player.removeEventListener("pause", events.paused);
          player.removeEventListener("error", events.failed);
          context.removeEventListener("statechange", interrupted);
          player.pause(); player.removeAttribute("src"); player.load();
          source.disconnect(); gain.disconnect(); void context.close().catch(() => {});
        },
      };
    },
    createEffects(interrupted) {
      const context = browserAudioContext();
      const gain = context.createGain();
      gain.connect(context.destination);
      let buffers = new Map<AudioCue, AudioBuffer>();
      let disposed = false;
      let activation = 0;
      const sources = new Set<AudioBufferSourceNode>();
      context.addEventListener("statechange", interrupted);
      return {
        resume(signal) { const current = ++activation; return resumeContext(context, signal, () => current === activation && !disposed); },
        suspend: () => context.state === "closed" ? Promise.resolve() : context.suspend(),
        isRunning: () => context.state === "running",
        setVolume: (volume) => { gain.gain.setTargetAtTime(volume, context.currentTime, 0.015); },
        async load(signal) {
          if (buffers.size === audioCues.length) return;
          const request = new AbortController();
          const abort = () => request.abort();
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) request.abort();
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const loading = Promise.all(audioCues.map(async (cue) => {
              const response = await fetch(`/audio/sfx/${cue}.mp3`, { signal: request.signal, credentials: "same-origin" });
              if (!response.ok) throw new Error("Sound could not load");
              const length = Number(response.headers.get("content-length"));
              if (Number.isFinite(length) && length > maxEffectBytes) throw new Error("Sound exceeds its resource limit");
              // Assets are local and bounded again before decoding, even without Content-Length.
              const bytes = await response.arrayBuffer();
              if (bytes.byteLength > maxEffectBytes || request.signal.aborted) throw new Error("Sound exceeds its resource limit");
              const buffer = await context.decodeAudioData(bytes);
              if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 8 || buffer.numberOfChannels > 2) throw new Error("Sound exceeds its resource limit");
              return [cue, buffer] as const;
            }));
            const results = await Promise.race([
              loading,
              new Promise<never>((_, reject) => { timer = setTimeout(() => { request.abort(); reject(new Error("Sound loading timed out")); }, assetTimeoutMs); }),
            ]);
            if (!disposed && !request.signal.aborted) buffers = new Map(results);
          } finally {
            if (timer !== undefined) clearTimeout(timer);
            signal.removeEventListener("abort", abort);
            request.abort();
          }
        },
        play(cue, ended) {
          const buffer = buffers.get(cue);
          if (disposed || !buffer || context.state !== "running") throw new Error("Sound is not ready");
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(gain);
          sources.add(source);
          let stopped = false;
          const cleanup = () => {
            if (stopped) return;
            stopped = true; sources.delete(source); source.disconnect(); ended();
          };
          source.onended = cleanup;
          try { source.start(); } catch (error) { cleanup(); throw error; }
          return { stop() { if (!stopped) { source.stop(); cleanup(); } } };
        },
        dispose() {
          disposed = true;
          context.removeEventListener("statechange", interrupted);
          sources.forEach((source) => { source.onended = null; try { source.stop(); } catch { /* Already ended. */ } source.disconnect(); });
          sources.clear(); buffers.clear(); gain.disconnect();
          void context.close().catch(() => {});
        },
      };
    },
  };
}
