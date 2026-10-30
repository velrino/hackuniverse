export const audioCues = ["menu-open", "menu-close", "ui-select", "zoom-in", "zoom-out", "camera-orbit", "toggle-on", "toggle-off", "destination-hover"] as const;
export type AudioCue = (typeof audioCues)[number];
export type AudioPreferences = Readonly<{
  musicEnabled: boolean;
  effectsEnabled: boolean;
  musicVolume: number;
  effectsVolume: number;
}>;
export type AudioStatus = "off" | "idle" | "loading" | "playing" | "ready" | "paused" | "error";
export type AudioFailure = "blocked" | "unavailable" | "load";
export type AudioSnapshot = Readonly<{
  preferences: AudioPreferences;
  musicStatus: AudioStatus;
  effectsStatus: AudioStatus;
  musicError: AudioFailure | null;
  effectsError: AudioFailure | null;
  preferenceError: boolean;
}>;

export type MusicPort = {
  play(): Promise<void>;
  pause(): void;
  setVolume(value: number): void;
  dispose(): void;
};
export type EffectVoice = { stop(fadeSeconds?: number): void };
export type EffectsPort = {
  resume(signal: AbortSignal): Promise<void>;
  suspend(): Promise<void>;
  isRunning(): boolean;
  load(signal: AbortSignal): Promise<void>;
  setVolume(value: number): void;
  play(cue: AudioCue, ended: () => void, delaySeconds?: number): EffectVoice;
  dispose(): void;
};
export type AudioPorts = {
  createMusic(events: { paused(): void; failed(): void }): MusicPort;
  createEffects(interrupted: () => void): EffectsPort;
  readPreferences(): unknown;
  writePreferences(preferences: AudioPreferences): void;
  now(): number;
};
