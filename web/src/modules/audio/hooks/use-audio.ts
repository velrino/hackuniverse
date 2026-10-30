"use client";

import { createContext, useContext } from "react";
import type { AudioController } from "../domain/controller";
import type { AudioSnapshot } from "../domain/types";

export type AudioControlsValue = AudioSnapshot & Pick<AudioController, "playCue" | "setMusicEnabled" | "setEffectsEnabled" | "enableMusic" | "enableEffects" | "setMusicVolume" | "setEffectsVolume" | "retry">;
export const AudioContext = createContext<AudioControlsValue | null>(null);
export function useAudio(): AudioControlsValue {
  const audio = useContext(AudioContext);
  if (!audio) throw new Error("useAudio must be used inside AudioProvider.");
  return audio;
}
