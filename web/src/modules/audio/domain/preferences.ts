import type { AudioPreferences } from "./types";

export const defaultAudioPreferences: AudioPreferences = Object.freeze({ muted: false, musicEnabled: true, effectsEnabled: true, musicVolume: 0.35, effectsVolume: 0.5 });
export function readAudioPreferences(value: unknown): AudioPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultAudioPreferences;
  const input = value as Record<string, unknown>;
  if (input.schemaVersion !== 1 || typeof input.musicEnabled !== "boolean" || typeof input.effectsEnabled !== "boolean") return defaultAudioPreferences;
  if (input.muted !== undefined && typeof input.muted !== "boolean") return defaultAudioPreferences;
  if (![input.musicVolume, input.effectsVolume].every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1)) return defaultAudioPreferences;
  return Object.freeze({ muted: input.muted === true, musicEnabled: input.musicEnabled, effectsEnabled: input.effectsEnabled, musicVolume: input.musicVolume as number, effectsVolume: input.effectsVolume as number });
}

export function audioVolume(value: number): number | null {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : null;
}
