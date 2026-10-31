"use client";

import { useId } from "react";
import { Music2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/i18n";
import { useAudio } from "../hooks/use-audio";
import { getAudioCopy } from "../messages";
import "./audio.css";

export function AudioControls() {
  const audio = useAudio();
  const { locale } = useI18n();
  const copy = getAudioCopy(locale);
  const id = useId();
  const musicFailure = audio.musicError && audio.musicError !== "blocked";
  const effectsFailure = audio.effectsError && audio.effectsError !== "blocked";
  const waiting = !audio.preferences.muted && (audio.musicError === "blocked" || audio.effectsError === "blocked");
  return <fieldset className="universe-menu-group audio-controls" data-audio-silent>
    <legend>{copy.title}</legend><p>{copy.introduction}</p>
    {audio.preferences.muted && <p>{copy.mutedHint}</p>}
    <div className="audio-controls__channel">
      <div className="audio-controls__heading">
        <label htmlFor={`${id}-music-enabled`}><Music2 aria-hidden="true" size={16} /><span>{copy.music}</span></label>
        <Switch id={`${id}-music-enabled`} checked={audio.preferences.musicEnabled} onCheckedChange={audio.setMusicEnabled} aria-describedby={`${id}-music-status`} />
      </div>
      <p id={`${id}-music-status`} role="status">{audio.preferences.muted ? copy.muted : audio.musicError === "blocked" ? copy.waiting : copy.statuses[audio.musicStatus]}</p>
      <label htmlFor={`${id}-music-volume`}>{copy.musicVolume}<output>{Math.round(audio.preferences.musicVolume * 100)}%</output></label>
      <input id={`${id}-music-volume`} type="range" min="0" max="100" step="1" value={Math.round(audio.preferences.musicVolume * 100)} onChange={(event) => audio.setMusicVolume(Number(event.target.value) / 100)} />
      {musicFailure && <p role="alert" className="audio-controls__error">{copy.errors[audio.musicError!]}</p>}
    </div>
    <div className="audio-controls__channel">
      <div className="audio-controls__heading">
        <label htmlFor={`${id}-effects-enabled`}><Volume2 aria-hidden="true" size={16} /><span>{copy.effects}</span></label>
        <Switch id={`${id}-effects-enabled`} checked={audio.preferences.effectsEnabled} onCheckedChange={audio.setEffectsEnabled} aria-describedby={`${id}-effects-status`} />
      </div>
      <p id={`${id}-effects-status`} role="status">{audio.preferences.muted ? copy.muted : audio.effectsError === "blocked" ? copy.waiting : copy.statuses[audio.effectsStatus]}</p>
      <label htmlFor={`${id}-effects-volume`}>{copy.effectsVolume}<output>{Math.round(audio.preferences.effectsVolume * 100)}%</output></label>
      <input id={`${id}-effects-volume`} type="range" min="0" max="100" step="1" value={Math.round(audio.preferences.effectsVolume * 100)} onChange={(event) => audio.setEffectsVolume(Number(event.target.value) / 100)} />
      {effectsFailure && <p role="alert" className="audio-controls__error">{copy.errors[audio.effectsError!]}</p>}
    </div>
    {waiting && <p>{copy.gestureHint}</p>}
    {audio.preferenceError && <p role="alert" className="audio-controls__error">{copy.preferenceError}</p>}
    {(musicFailure || effectsFailure || audio.preferenceError) && <Button type="button" variant="outline" onClick={audio.retry}>{copy.retry}</Button>}
  </fieldset>;
}
