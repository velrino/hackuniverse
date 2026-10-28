"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Layers3, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUniverseAdapters } from "../../adapters/hooks/use-universe-adapters";
import { useUniverseNavigation } from "../../hooks/use-universe-navigation";
import { useUniverseTour, type UniverseTourStep } from "../../hooks/use-universe-tour";
import type { UniverseTourCameraStep } from "../../scene/types";
import { getEntity, getParent } from "../../domain/catalog";
import type { ShipFlightInput } from "../../scene/flight/types";
import { PlanetDetails } from "../../ui/shared/PlanetDetails";
import { ExplorerMenu } from "../../ui/shared/ExplorerMenu";
import { FlightControls } from "../../ui/shared/FlightControls";

const neutralInput: ShipFlightInput = { throttle: 0, turn: 0, lift: 0, boost: false };
const noTourSteps: readonly UniverseTourStep[] = [];

export function Explorer() {
  const { catalog, copy, tour: tourDefinition, presentationReady = true, autoTour = true, components: { Scene, BrandLogo, LanguagePicker, DesignLink } } = useUniverseAdapters();
  const { current, parent, view, navigate, planet } = useUniverseNavigation(catalog);
  const activeSystem = current.kind === "system" ? current : current.kind === "planet" ? getParent(catalog, current.id) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [showOrbits, setShowOrbits] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [sceneStatus, setSceneStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [flightEnabled, setFlightEnabled] = useState(false);
  const [flightStatus, setFlightStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [flightInput, setFlightInput] = useState<ShipFlightInput>(neutralInput);
  const [flightTargetId, setFlightTargetId] = useState<string | null>(null);
  const [autopilotTargetId, setAutopilotTargetId] = useState<string | null>(null);
  const [tourCameraStep, setTourCameraStep] = useState<UniverseTourCameraStep | null>(null);
  const onReady = useCallback(() => setSceneStatus("ready"), []);
  const onUnavailable = useCallback(() => { setSceneStatus("unavailable"); setFlightEnabled(false); }, []);
  const onFlightStatus = useCallback((status: "idle" | "loading" | "ready" | "error") => setFlightStatus(status), []);
  const onAutopilotEnd = useCallback(() => setAutopilotTargetId(null), []);
  const blocked = menuOpen;
  const tourAvailable = useMemo(() => Boolean(tourDefinition?.steps.length && tourDefinition.steps.every((step) => getEntity(catalog, step.target))), [catalog, tourDefinition]);
  const onTourStep = useCallback((step: UniverseTourStep, token: string) => {
    setFlightEnabled(false);
    setFlightTargetId(null);
    setAutopilotTargetId(null);
    navigate(step.target.id);
    setTourCameraStep({ target: step.target, token });
  }, [navigate]);
  const tour = useUniverseTour({
    storageKey: tourDefinition?.storageKey ?? null,
    steps: tourDefinition?.steps ?? noTourSteps,
    ready: presentationReady && sceneStatus === "ready" && !menuOpen && !flightEnabled,
    enabled: tourAvailable,
    autoStart: autoTour,
    onStep: onTourStep,
  });
  const { cancel: cancelTour } = tour;
  const changeMenu = useCallback((open: boolean) => {
    if (open) cancelTour();
    setMenuOpen(open);
  }, [cancelTour]);
  const startTour = () => {
    setFlightEnabled(false);
    setMenuOpen(false);
    tour.start();
  };

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !document.querySelector('[data-slot="dialog-content"]')) changeMenu(true);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [changeMenu]);

  useEffect(() => {
    const cancelHiddenTour = () => { if (document.hidden) cancelTour(); };
    document.addEventListener("visibilitychange", cancelHiddenTour);
    return () => document.removeEventListener("visibilitychange", cancelHiddenTour);
  }, [cancelTour]);

  const goTo = (id: string) => {
    cancelTour();
    setFlightEnabled(false);
    setFlightTargetId(null);
    setAutopilotTargetId(null);
    navigate(id);
  };
  const selectSceneNode = (id: string) => {
    const entity = getEntity(catalog, id);
    if (flightEnabled && entity?.kind === "planet" && entity.parentId === activeSystem?.id) {
      if (flightTargetId !== id) setAutopilotTargetId(null);
      setFlightTargetId(id);
      return;
    }
    if (!flightEnabled) goTo(id);
  };
  const guideTo = (id: string) => {
    const destination = getEntity(catalog, id);
    if (!flightEnabled || destination?.kind !== "planet" || destination.parentId !== activeSystem?.id) return;
    setAutopilotTargetId((previous) => previous === id ? null : id);
  };
  const goWider = () => { if (parent) goTo(parent.id); };
  const toggleFlight = () => {
    setFlightTargetId(null);
    setAutopilotTargetId(null);
    if (flightEnabled) { setFlightEnabled(false); return; }
    if (!activeSystem) return;
    if (planet) {
      const system = getParent(catalog, planet.id);
      if (system) navigate(system.id);
    }
    setFlightInput(neutralInput);
    setFlightEnabled(true);
  };

  return (
    <main className="universe-page universe-minimal" aria-label={copy.title} data-scale={current.kind} data-flight={flightEnabled} data-flight-status={flightStatus} data-tour-phase={tour.phase}>
      <div className="universe-scene" aria-busy={sceneStatus === "loading"}>
        <Scene view={view} selectedId={planet?.id ?? null} playing={!blocked} showOrbits={showOrbits} autoOrbit={tour.active || autoOrbit} resetToken={resetToken} zoomAction={null} onSelect={selectSceneNode} onReady={onReady} onUnavailable={onUnavailable} ariaLabel={copy.canvas} flightEnabled={flightEnabled} flightPaused={blocked} flightInput={flightInput} onFlightStatus={onFlightStatus} flightTargetId={flightEnabled ? flightTargetId : null} autopilotTargetId={flightEnabled ? autopilotTargetId : null} guideActionLabel={autopilotTargetId === flightTargetId && autopilotTargetId ? copy.cancelGuidance : copy.guideShip} onGuideRequest={guideTo} onAutopilotEnd={onAutopilotEnd} hasParentView={Boolean(parent)} onScaleOut={goWider} onScaleIn={goTo} tourStep={tour.active && tour.token === tourCameraStep?.token ? tourCameraStep : null} onTourArrive={tour.arrive} onInteraction={cancelTour} />
      </div>
      <div className="universe-vignette" aria-hidden="true" />
      <header className="universe-topbar">
        <div className="universe-brand universe-brand-static"><BrandLogo size={32} eager /><span>HackUniverse<small>{catalog.mode === "demo" ? copy.demo : copy.title}</small></span></div>
        <div className="universe-context" aria-live="polite"><span>{copy.kinds[current.kind]}</span><h1>{current.name}</h1></div>
        <ExplorerMenu catalog={catalog} copy={copy} open={menuOpen} onOpenChange={changeMenu} currentId={current.id} onNavigate={goTo} showOrbits={showOrbits} onToggleOrbits={() => setShowOrbits((value) => !value)} autoOrbit={autoOrbit} onToggleAutoOrbit={() => setAutoOrbit((value) => !value)} onResetCamera={() => setResetToken((value) => value + 1)} flightEnabled={flightEnabled} flightAvailable={Boolean(activeSystem) && sceneStatus === "ready"} flightStatus={flightStatus} onToggleFlight={toggleFlight} tourAvailable={tourAvailable && sceneStatus === "ready"} onStartTour={startTour} LanguagePicker={LanguagePicker} DesignLink={DesignLink} />
      </header>
      {(sceneStatus === "loading" || flightStatus === "loading") && <div className="universe-scene-state" role="status"><Orbit className="universe-loading-orbit" size={24} aria-hidden="true" /><p>{flightStatus === "loading" ? copy.flightLoading : copy.loading}</p></div>}
      {sceneStatus === "unavailable" && <section className="universe-scene-state universe-fallback" role="status"><h2>{copy.fallbackTitle}</h2><p>{copy.fallbackDescription}</p><Button className="hud-button" onClick={() => setMenuOpen(true)}>{copy.library}</Button></section>}
      {flightStatus === "error" && <button type="button" className="universe-flight-error" onClick={() => setMenuOpen(true)}>{copy.flightError}</button>}
      {planet && !flightEnabled && !tour.active && <PlanetDetails planet={planet} copy={copy} onBack={goWider} demo={catalog.mode === "demo"} />}
      {tour.active && <div className="universe-tour-status"><p role="status">{copy.tourTitle} · {current.name}</p><Button type="button" variant="outline" className="hud-button" onClick={cancelTour}>{copy.tourSkip}</Button></div>}
      {parent && <Button type="button" variant="outline" className="hud-button universe-scale-back" onClick={goWider} title={`${copy.wider}: ${copy.kinds[parent.kind]}`}><Layers3 aria-hidden="true" /><span>{copy.kinds[parent.kind]}</span></Button>}
      {flightEnabled && !blocked && <><FlightControls copy={copy} onInput={setFlightInput} /><Button type="button" variant="outline" className="hud-button universe-flight-exit" onClick={() => setFlightEnabled(false)}><ArrowLeft aria-hidden="true" />{copy.exitFlight}</Button></>}
    </main>
  );
}
