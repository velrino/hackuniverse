"use client";

import { useEffect, useRef } from "react";
import { createUniverseController } from "./controller";
import type { UniverseSceneProps } from "./types";
import "./labels.css";

export function UniverseScene({ view, selectedId, playing, showOrbits, autoOrbit = true, resetToken, zoomAction, ariaLabel, onSelect, onReady, onUnavailable, onError, flightEnabled = false, flightPaused = false, flightInput, onFlightStatus, flightTargetId, guideActionLabel, onGuideRequest, autopilotTargetId, onAutopilotEnd, hasParentView = false, onScaleOut, onScaleIn, tourStep = null, tourPreparing = false, onTourArrive, entityTransition = null, onEntityTransitionEnd, onInteraction, onZoomIntent, onOrbitIntent, onCameraGestureEnd, onDestinationHover, cameraRestore, onCameraChange, onCameraRestored, onCameraReader, starSelected = false, starFocusToken = 0, onSelectStar }: UniverseSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createUniverseController> | null>(null);
  const callbacks = useRef({ onSelect, onReady, onUnavailable, onError, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn, onTourArrive, onEntityTransitionEnd, onInteraction, onZoomIntent, onOrbitIntent, onCameraGestureEnd, onDestinationHover, onCameraChange, onCameraRestored, onCameraReader, onSelectStar });
  const zoomDirection = zoomAction?.direction;
  const zoomToken = zoomAction?.token;
  const lastReset = useRef(resetToken);

  useEffect(() => { callbacks.current = { onSelect, onReady, onUnavailable, onError, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn, onTourArrive, onEntityTransitionEnd, onInteraction, onZoomIntent, onOrbitIntent, onCameraGestureEnd, onDestinationHover, onCameraChange, onCameraRestored, onCameraReader, onSelectStar }; }, [onSelect, onReady, onUnavailable, onError, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn, onTourArrive, onEntityTransitionEnd, onInteraction, onZoomIntent, onOrbitIntent, onCameraGestureEnd, onDestinationHover, onCameraChange, onCameraRestored, onCameraReader, onSelectStar]);

  useEffect(() => {
    if (!host.current) return;
    try {
      controller.current = createUniverseController(host.current, {
        onSelect: (id) => callbacks.current.onSelect(id),
        onReady: () => callbacks.current.onReady(),
        onUnavailable: () => callbacks.current.onUnavailable(),
        onFlightStatus: (status) => callbacks.current.onFlightStatus?.(status),
        onGuideRequest: (id) => callbacks.current.onGuideRequest?.(id),
        onAutopilotEnd: () => callbacks.current.onAutopilotEnd?.(),
        onScaleOut: () => callbacks.current.onScaleOut?.(),
        onScaleIn: (id) => callbacks.current.onScaleIn?.(id),
        onTourArrive: (token) => callbacks.current.onTourArrive?.(token),
        onEntityTransitionEnd: (token) => callbacks.current.onEntityTransitionEnd?.(token),
        onInteraction: () => callbacks.current.onInteraction?.(),
        onZoomIntent: (direction) => callbacks.current.onZoomIntent?.(direction),
        onOrbitIntent: () => callbacks.current.onOrbitIntent?.(),
        onCameraGestureEnd: (motion) => callbacks.current.onCameraGestureEnd?.(motion),
        onDestinationHover: (id) => callbacks.current.onDestinationHover?.(id),
        onCameraChange: (pose, reason) => callbacks.current.onCameraChange?.(pose, reason),
        onCameraRestored: (token, success) => callbacks.current.onCameraRestored?.(token, success),
        onSelectStar: () => callbacks.current.onSelectStar?.(),
        onError: (error, operation) => callbacks.current.onError?.(error, operation),
      });
      callbacks.current.onCameraReader?.(() => controller.current?.readCameraPose() ?? null);
    } catch (error) {
      try { callbacks.current.onError?.(error, "initialize"); } catch { /* Diagnostics must not interrupt recovery. */ }
      callbacks.current.onUnavailable();
    }
    return () => { callbacks.current.onCameraReader?.(null); controller.current?.destroy(); controller.current = null; };
  }, []);

  // Release the previous tour before a manual destination starts its own tween.
  useEffect(() => { if (!tourStep) controller.current?.setTourStep?.(null); }, [tourStep]);
  useEffect(() => { controller.current?.setTourPreparing?.(tourPreparing); }, [tourPreparing]);

  useEffect(() => {
    try { controller.current?.setView(view); }
    catch (error) {
      try { callbacks.current.onError?.(error, "view"); } catch { /* Diagnostics must not interrupt recovery. */ }
      controller.current?.destroy();
      controller.current = null;
      callbacks.current.onUnavailable();
    }
  }, [view]);
  useEffect(() => { controller.current?.setSelected(selectedId); }, [selectedId, view]);
  useEffect(() => { controller.current?.setStarSelected?.(starSelected); }, [starSelected, starFocusToken, view]);
  useEffect(() => { controller.current?.setPlaying(playing); }, [playing]);
  useEffect(() => { controller.current?.setOrbits(showOrbits); }, [showOrbits]);
  useEffect(() => { controller.current?.setAutoOrbit?.(autoOrbit); }, [autoOrbit]);
  useEffect(() => { controller.current?.setAriaLabel(ariaLabel); }, [ariaLabel]);
  useEffect(() => { if (lastReset.current !== resetToken) { lastReset.current = resetToken; controller.current?.reset(); } }, [resetToken]);
  useEffect(() => { if (zoomDirection) controller.current?.zoom(zoomDirection); }, [zoomDirection, zoomToken]);
  useEffect(() => { controller.current?.setFlightEnabled(flightEnabled); }, [flightEnabled]);
  useEffect(() => { controller.current?.setFlightPaused(flightPaused); }, [flightPaused]);
  useEffect(() => { if (flightInput) controller.current?.setFlightInput(flightInput); }, [flightInput]);
  useEffect(() => { controller.current?.setFlightTarget(flightTargetId ?? null); }, [flightTargetId, view]);
  useEffect(() => { controller.current?.setGuideActionLabel(guideActionLabel ?? ""); }, [guideActionLabel]);
  useEffect(() => { controller.current?.setAutopilotTarget(autopilotTargetId ?? null); }, [autopilotTargetId, flightEnabled]);
  useEffect(() => { controller.current?.setHasParentView(hasParentView); }, [hasParentView]);
  useEffect(() => { if (tourStep) controller.current?.setTourStep?.(tourStep); }, [tourStep, view]);
  // Resolve particles only after the current catalog projection and selection exist.
  useEffect(() => {
    if (controller.current?.setEntityTransition) controller.current.setEntityTransition(entityTransition);
    else if (entityTransition) {
      try { callbacks.current.onEntityTransitionEnd?.(entityTransition.token); } catch { /* Preserve the editor fallback. */ }
    }
  }, [entityTransition, view]);

  // Last: explicit URL intent wins over default focus, reset and tour effects.
  useEffect(() => { if (cameraRestore) controller.current?.restoreCamera(cameraRestore); }, [cameraRestore, view, selectedId, flightEnabled, tourStep, tourPreparing]);

  return <div ref={host} className="universe-scene" style={{ position: "absolute", inset: 0 }} />;
}

export default UniverseScene;
