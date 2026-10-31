"use client";

import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { useAudio } from "../../hooks/use-audio";
import { getAudioCopy } from "../../messages";
import "./styles.css";

export function AudioToggle({ className = "" }: { className?: string }) {
  const { preferences, setMuted } = useAudio();
  const { locale } = useI18n();
  const copy = getAudioCopy(locale);
  const enabled = !preferences.muted && (preferences.musicEnabled || preferences.effectsEnabled);
  const label = enabled ? copy.muteSound : copy.enableSound;
  const Icon = enabled ? Volume2 : VolumeX;

  return <Button type="button" variant="outline" size="icon" className={`audio-toggle ${className}`} aria-label={label} title={label} aria-pressed={enabled} data-audio-silent onClick={() => setMuted(enabled)}>
    <Icon aria-hidden="true" size={18} strokeWidth={1.5} />
  </Button>;
}
