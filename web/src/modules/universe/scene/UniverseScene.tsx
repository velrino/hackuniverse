"use client";

import { useEffect, useRef } from "react";
import { createUniverseController } from "./controller";
import type { UniverseSceneProps } from "./types";
import "./labels.css";

export function UniverseScene({ view, selectedId, playing, showOrbits, resetToken, zoomAction, ariaLabel, onSelect, onReady, onUnavailable, flightEnabled = false, flightPaused = false, flightInput, onFlightStatus, flightTargetId, guideActionLabel, onGuideRequest, autopilotTargetId, onAutopilotEnd, hasParentView = false, onScaleOut, onScaleIn }: UniverseSceneProps) {
  const host = useRef<HTMLDivElement>(null);
  const controller = useRef<ReturnType<typeof createUniverseController> | null>(null);
  const callbacks = useRef({ onSelect, onReady, onUnavailable, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn });
  const zoomDirection = zoomAction?.direction;
  const zoomToken = zoomAction?.token;

  useEffect(() => { callbacks.current = { onSelect, onReady, onUnavailable, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn }; }, [onSelect, onReady, onUnavailable, onFlightStatus, onGuideRequest, onAutopilotEnd, onScaleOut, onScaleIn]);

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
      });
    } catch {
      callbacks.current.onUnavailable();
    }
    return () => { controller.current?.destroy(); controller.current = null; };
  }, []);

  useEffect(() => {
    try { controller.current?.setView(view); }
    catch {
      controller.current?.destroy();
      controller.current = null;
      callbacks.current.onUnavailable();
    }
  }, [view]);
  useEffect(() => { controller.current?.setSelected(selectedId); }, [selectedId, view]);
  useEffect(() => { controller.current?.setPlaying(playing); }, [playing]);
  useEffect(() => { controller.current?.setOrbits(showOrbits); }, [showOrbits]);
  useEffect(() => { controller.current?.setAriaLabel(ariaLabel); }, [ariaLabel]);
  useEffect(() => { controller.current?.reset(); }, [resetToken]);
  useEffect(() => { if (zoomDirection) controller.current?.zoom(zoomDirection); }, [zoomDirection, zoomToken]);
  useEffect(() => { controller.current?.setFlightEnabled(flightEnabled); }, [flightEnabled]);
  useEffect(() => { controller.current?.setFlightPaused(flightPaused); }, [flightPaused]);
  useEffect(() => { if (flightInput) controller.current?.setFlightInput(flightInput); }, [flightInput]);
  useEffect(() => { controller.current?.setFlightTarget(flightTargetId ?? null); }, [flightTargetId, view]);
  useEffect(() => { controller.current?.setGuideActionLabel(guideActionLabel ?? ""); }, [guideActionLabel]);
  useEffect(() => { controller.current?.setAutopilotTarget(autopilotTargetId ?? null); }, [autopilotTargetId, flightEnabled]);
  useEffect(() => { controller.current?.setHasParentView(hasParentView); }, [hasParentView]);

  return <div ref={host} className="universe-scene" style={{ position: "absolute", inset: 0 }} />;
}

export default UniverseScene;
