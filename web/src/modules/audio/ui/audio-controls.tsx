"use client";

import { useId } from "react";
import { Music2, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { useI18n } from "@/i18n";
import { useAudio } from "../hooks/use-audio";
import { getAudioCopy } from "../messages";
import "./audio.css";

export function AudioControls() {
  const audio = useAudio();
  const { locale } = useI18n();
  const copy = getAudioCopy(locale);
  const id = useId();
  const musicWaiting = audio.musicStatus === "idle" || audio.musicStatus === "paused" || audio.musicStatus === "error";
  const effectsWaiting = audio.effectsStatus === "idle" || audio.effectsStatus === "paused" || audio.effectsStatus === "error";
  return <Panel as="section" className="audio-controls" aria-labelledby={`${id}-title`} data-audio-silent>
    <h3 id={`${id}-title`}>{copy.title}</h3><p>{copy.introduction}</p>
    <div className="audio-controls__channel">
      <div className="audio-controls__heading"><h4><Music2 aria-hidden="true" size={16} />{copy.music}</h4><span role="status">{copy.statuses[audio.musicStatus]}</span></div>
      <Button type="button" variant="outline" aria-pressed={audio.preferences.musicEnabled} onClick={() => audio.setMusicEnabled(!audio.preferences.musicEnabled)}>{audio.preferences.musicEnabled ? copy.disableMusic : copy.enableMusic}</Button>
      {audio.preferences.musicEnabled && musicWaiting && <Button type="button" variant="outline" onClick={audio.enableMusic}>{copy.startMusic}</Button>}
      <label htmlFor={`${id}-music`}>{copy.musicVolume}<output>{Math.round(audio.preferences.musicVolume * 100)}%</output></label>
      <input id={`${id}-music`} type="range" min="0" max="100" step="1" value={Math.round(audio.preferences.musicVolume * 100)} onChange={(event) => audio.setMusicVolume(Number(event.target.value) / 100)} />
      {audio.musicError && <p role="alert" className="audio-controls__error">{copy.errors[audio.musicError]}</p>}
    </div>
    <div className="audio-controls__channel">
      <div className="audio-controls__heading"><h4>{audio.preferences.effectsEnabled ? <Volume2 aria-hidden="true" size={16} /> : <VolumeX aria-hidden="true" size={16} />}{copy.effects}</h4><span role="status">{copy.statuses[audio.effectsStatus]}</span></div>
      <Button type="button" variant="outline" aria-pressed={audio.preferences.effectsEnabled} onClick={() => audio.setEffectsEnabled(!audio.preferences.effectsEnabled)}>{audio.preferences.effectsEnabled ? copy.disableEffects : copy.enableEffects}</Button>
      {audio.preferences.effectsEnabled && effectsWaiting && <Button type="button" variant="outline" onClick={audio.enableEffects}>{copy.startEffects}</Button>}
      <label htmlFor={`${id}-effects`}>{copy.effectsVolume}<output>{Math.round(audio.preferences.effectsVolume * 100)}%</output></label>
      <input id={`${id}-effects`} type="range" min="0" max="100" step="1" value={Math.round(audio.preferences.effectsVolume * 100)} onChange={(event) => audio.setEffectsVolume(Number(event.target.value) / 100)} />
      {audio.effectsError && <p role="alert" className="audio-controls__error">{copy.errors[audio.effectsError]}</p>}
    </div>
    {(audio.musicStatus === "idle" || audio.effectsStatus === "idle") && <p>{copy.savedGesture}</p>}
    {audio.preferenceError && <p role="alert" className="audio-controls__error">{copy.preferenceError}</p>}
    {(audio.musicError || audio.effectsError || audio.preferenceError) && <Button type="button" variant="outline" onClick={audio.retry}>{copy.retry}</Button>}
  </Panel>;
}
