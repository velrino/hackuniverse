"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DesignSystemLink } from "@/modules/design-system";
import { BrandLogo } from "@/components/brand-logo";
import { useApplicationIntroReady, useApplicationPreparation } from "@/components/application-intro";
import { InlineLanguageSelector, useI18n, useTranslations } from "@/i18n";
import { AudioControls, AudioToggle, useAudio } from "@/modules/audio";
import { UniverseRoot, type UniverseAdapters, type UniverseAudio, type UniverseCatalog, type UniverseManagement, type UniverseTourDefinition } from "@/modules/universe";
import { captureClientException } from "@/lib/telemetry/client";
import type { UniverseSceneProps } from "../scene";
import type { CameraLinkSource, UniverseCameraPose } from "../domain/camera-link";
import type { NavigationTarget } from "../domain/types";
import { CameraLocationContext, CameraLinkStatus, CameraShareControls, useCameraLocation, useCameraLocationContext } from "./use-camera-location";
import type { UniverseCopy } from "../messages";

const Scene = dynamic(() => import("../scene").then((module) => module.UniverseScene), { ssr: false });

function ObservedScene(props: UniverseSceneProps) {
  const [prepared, setPrepared] = useState(false);
  useApplicationPreparation(prepared);
  const { onReady, onUnavailable } = props;
  const sceneReady = useCallback(() => { setPrepared(true); onReady(); }, [onReady]);
  const sceneUnavailable = useCallback(() => { setPrepared(true); onUnavailable(); }, [onUnavailable]);
  const location = useCameraLocationContext();
  const controller = location?.controller;
  const target = useRef<NavigationTarget | null>(null);
  useEffect(() => {
    target.current = props.selectedId ? { kind: "planet", id: props.selectedId } : props.view.anchor ? { kind: props.view.anchor.kind, id: props.view.anchor.id } : null;
  }, [props.selectedId, props.view]);
  const attachCamera = useCallback((reader: (() => UniverseCameraPose | null) | null) => {
    controller?.attach(reader ? () => {
      const pose = reader();
      return pose && target.current ? { target: target.current, pose } : null;
    } : null);
  }, [controller]);
  const cameraChanged = useCallback<NonNullable<UniverseSceneProps["onCameraChange"]>>((pose, reason) => {
    if (target.current) controller?.capture({ target: target.current, pose }, reason);
  }, [controller]);
  const cameraRestored = useCallback((token: string, success: boolean) => controller?.restored(token, success), [controller]);
  const { onError } = props;
  const reportError = useCallback<NonNullable<UniverseSceneProps["onError"]>>((error, operation) => {
    try { captureClientException(error, { source: "universe-scene", operation }); }
    finally { onError?.(error, operation); }
  }, [onError]);
  return <Scene {...props} onReady={sceneReady} onUnavailable={sceneUnavailable} onError={reportError} cameraRestore={location?.state.restore} onCameraChange={cameraChanged} onCameraRestored={cameraRestored} onCameraReader={attachCamera} />;
}
const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
const getReducedMotion = () => window.matchMedia(motionQuery).matches;

export function UniverseHost({ catalog, tour, management, source, presentation }: { catalog: UniverseCatalog; tour?: UniverseTourDefinition; management?: UniverseManagement; source?: CameraLinkSource; presentation?: { regions: UniverseCopy["demoRegions"]; factualReferences: boolean } }) {
  const translations = useTranslations("universe");
  const regionPresentation = presentation?.regions;
  const copy = useMemo(() => regionPresentation ? {
    ...translations,
    kinds: { ...translations.kinds, cloud: regionPresentation.label },
    scaleHints: { ...translations.scaleHints, galaxy: regionPresentation.galaxyHint, cloud: regionPresentation.cloudHint },
  } : translations, [translations, regionPresentation]);
  const { format } = useI18n();
  const { playCue, cameraMotion, stopCameraMotion, unlockFromGesture, interactionReceived, preferences, musicStatus, effectsStatus, musicError, effectsError } = useAudio();
  const musicWaiting = preferences.musicEnabled && preferences.musicVolume > 0 && musicStatus !== "playing" && (musicStatus !== "error" || musicError === "blocked");
  const effectsWaiting = preferences.effectsEnabled && preferences.effectsVolume > 0 && effectsStatus !== "ready" && (effectsStatus !== "error" || effectsError === "blocked");
  const tourRequiresInteraction = !preferences.muted && !interactionReceived && (musicWaiting || effectsWaiting);
  const camera = useCameraLocation(catalog, source);
  const location = useMemo(() => ({ navigationRequest: camera.state.navigationRequest, Controls: CameraShareControls, Status: CameraLinkStatus }), [camera.state.navigationRequest]);
  const audio = useMemo<UniverseAudio>(() => ({
    tourRequiresInteraction,
    onTourStart: unlockFromGesture,
    onTourZoomIntent: (direction) => cameraMotion("zoom", direction),
    onTourZoomEnd: () => stopCameraMotion("zoom"),
    onZoomIntent: (direction) => cameraMotion("zoom", direction),
    onOrbitIntent: () => cameraMotion("orbit"),
    onCameraGestureEnd: (motion) => stopCameraMotion(motion),
    onDestinationHover: () => playCue("destination-hover"),
    onMenuOpenChange: (open) => playCue(open ? "menu-open" : "menu-close"),
    Controls: AudioControls,
    Toggle: AudioToggle,
  }), [playCue, cameraMotion, stopCameraMotion, unlockFromGesture, tourRequiresInteraction]);
  const presentationReady = useApplicationIntroReady();
  const reducedMotion = useSyncExternalStore(subscribeMotion, getReducedMotion, () => true);
  const allowDemoReferences = Boolean(presentation?.factualReferences);
  const adapters = useMemo<UniverseAdapters>(() => ({ catalog, copy, tour, management, audio, location, presentationReady, allowDemoReferences, autoTour: camera.state.ready && !camera.state.suppressAutoTour && !reducedMotion, formatNumber: format.number, components: { Scene: ObservedScene, BrandLogo, LanguagePicker: InlineLanguageSelector, DesignLink: DesignSystemLink } }), [catalog, copy, tour, management, audio, location, presentationReady, allowDemoReferences, camera.state.ready, camera.state.suppressAutoTour, reducedMotion, format.number]);
  return <CameraLocationContext value={{ ...camera, source }}><UniverseRoot adapters={adapters} /></CameraLocationContext>;
}
