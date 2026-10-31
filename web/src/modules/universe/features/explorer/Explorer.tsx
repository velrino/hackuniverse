"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Layers3, Orbit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { Dialog, DialogContent, DialogHeader, DialogTitle, useDialogReturnFocus } from "@/components/ui/dialog";
import { useUniverseAdapters } from "../../adapters/hooks/use-universe-adapters";
import { useUniverseNavigation } from "../../hooks/use-universe-navigation";
import { useUniverseTour, type UniverseTourStep } from "../../hooks/use-universe-tour";
import { buildManualUniverseTour } from "../../hooks/universe-tour-route";
import type { UniverseTourCameraStep } from "../../scene/types";
import { getEntity, getParent, getPlanetCount, getSystemStar } from "../../domain/catalog";
import type { ShipFlightInput } from "../../scene/flight/types";
import { PlanetDetails } from "../../ui/shared/PlanetDetails";
import { StarDetails } from "../../ui/shared/StarDetails";
import { ExplorerMenu } from "../../ui/shared/ExplorerMenu";
import { FlightControls } from "../../ui/shared/FlightControls";

const neutralInput: ShipFlightInput = { throttle: 0, turn: 0, lift: 0, boost: false };
const noTourSteps: readonly UniverseTourStep[] = [];

export function Explorer() {
  const { catalog, copy, management, audio, location, tour: tourDefinition, presentationReady = true, allowDemoReferences = false, discoveryTarget, autoTour = true, formatNumber, components: { Scene, BrandLogo, LanguagePicker, DesignLink } } = useUniverseAdapters();
  const { current, parent, view, navigate, planet } = useUniverseNavigation(catalog, management?.navigationRequest, location?.navigationRequest);
  const activeSystem = current.kind === "system" ? current : current.kind === "planet" ? getParent(catalog, current.id) : undefined;
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const shareFocus = useDialogReturnFocus();
  const menuOpenRef = useRef(false);
  const hud = useRef<HTMLDivElement>(null);
  const skipTourButton = useRef<HTMLButtonElement>(null);
  const startTourButton = useRef<HTMLButtonElement>(null);
  const tourHadFocus = useRef(false);
  const tourWasActive = useRef(false);
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
  const [selectedStarSystemId, setSelectedStarSystemId] = useState<string | null>(null);
  const [starFocusToken, setStarFocusToken] = useState(0);
  const starSelected = current.kind === "system" && selectedStarSystemId === current.id;
  const selectedStar = starSelected ? getSystemStar(catalog, current.id) ?? { name: view.starName ?? current.name, description: current.description } : undefined;
  const onReady = useCallback(() => setSceneStatus("ready"), []);
  const onUnavailable = useCallback(() => { setSceneStatus("unavailable"); setFlightEnabled(false); }, []);
  const onFlightStatus = useCallback((status: "idle" | "loading" | "ready" | "error") => setFlightStatus(status), []);
  const onAutopilotEnd = useCallback(() => setAutopilotTargetId(null), []);
  const blocked = menuOpen || shareOpen || Boolean(management?.blocked);
  const tourAvailable = useMemo(() => Boolean(tourDefinition?.steps.length && tourDefinition.steps.every((step) => getEntity(catalog, step.target))), [catalog, tourDefinition]);
  const onTourStep = useCallback((step: UniverseTourStep, token: string) => {
    setSelectedStarSystemId(null);
    setFlightEnabled(false);
    setFlightTargetId(null);
    setAutopilotTargetId(null);
    navigate(step.target.id);
    setTourCameraStep({ target: step.target, token, ...(step.motion ? { motion: step.motion } : {}) });
  }, [navigate]);
  const tour = useUniverseTour({
    storageKey: tourDefinition?.storageKey ?? null,
    steps: tourDefinition?.steps ?? noTourSteps,
    ready: presentationReady && sceneStatus === "ready" && !blocked && !flightEnabled && flightStatus === "idle",
    enabled: tourAvailable,
    autoStart: autoTour,
    requireStart: audio?.tourRequiresInteraction,
    onStep: onTourStep,
  });
  const { cancel: cancelTour } = tour;
  useEffect(() => { if (tour.awaitingStart) startTourButton.current?.focus({ preventScroll: true }); }, [tour.awaitingStart]);
  const locationRequestToken = location?.navigationRequest?.token;
  useEffect(() => {
    if (!locationRequestToken) return;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      cancelTour();
      setFlightEnabled(false);
      setFlightTargetId(null);
      setAutopilotTargetId(null);
      setSelectedStarSystemId(null);
    });
    return () => { current = false; };
  }, [locationRequestToken, cancelTour]);
  useEffect(() => {
    if (!tour.active) {
      if (tourWasActive.current && tourHadFocus.current && !document.querySelector('[data-slot="dialog-content"]')) {
        hud.current?.querySelector<HTMLButtonElement>(".universe-menu-trigger")?.focus({ preventScroll: true });
      }
      tourWasActive.current = false;
      tourHadFocus.current = false;
      return;
    }
    tourWasActive.current = true;
    tourHadFocus.current = true;
    skipTourButton.current?.focus({ preventScroll: true });
    const trackFocus = (event: FocusEvent) => {
      // Hiding a focused control can move focus to body. An explicit canvas or
      // dialog focus belongs to the player's next interaction and must survive.
      if (event.target !== document.body && event.target !== document.documentElement) {
        tourHadFocus.current = event.target === skipTourButton.current;
      }
    };
    document.addEventListener("focusin", trackFocus);
    return () => document.removeEventListener("focusin", trackFocus);
  }, [tour.active]);
  const changeMenu = useCallback((open: boolean) => {
    if (menuOpenRef.current === open) return;
    if (open) cancelTour();
    menuOpenRef.current = open;
    setMenuOpen(open);
    try { audio?.onMenuOpenChange?.(open); } catch { /* Optional feedback cannot block the menu. */ }
  }, [cancelTour, audio]);
  const zoomFeedback = useCallback((direction: "in" | "out") => {
    try { audio?.onZoomIntent?.(direction); } catch { /* Optional feedback cannot block navigation. */ }
  }, [audio]);
  const orbitFeedback = useCallback(() => {
    try { audio?.onOrbitIntent?.(); } catch { /* Optional feedback cannot block navigation. */ }
  }, [audio]);
  const stopCameraFeedback = useCallback((motion: "zoom" | "orbit") => {
    try { audio?.onCameraGestureEnd?.(motion); } catch { /* Optional feedback cannot block navigation. */ }
  }, [audio]);
  const hoverFeedback = useCallback((id: string) => {
    try { audio?.onDestinationHover?.(id); } catch { /* Optional feedback cannot block navigation. */ }
  }, [audio]);
  const tourZoomFeedback = useCallback((direction: "in" | "out") => {
    try { audio?.onTourZoomIntent?.(direction); } catch { /* Optional feedback cannot block the tour. */ }
  }, [audio]);
  const stopTourZoomFeedback = useCallback(() => {
    try { audio?.onTourZoomEnd?.(); } catch { /* Optional feedback cannot block the tour. */ }
  }, [audio]);
  const unlockTourAudio = () => {
    try { audio?.onTourStart?.(); } catch { /* Playback permission cannot block exploration. */ }
  };
  const startTour = () => {
    unlockTourAudio();
    const prepared = buildManualUniverseTour(catalog, { kind: current.kind, id: current.id }, tourDefinition?.steps ?? noTourSteps);
    if (!prepared) return;
    setSelectedStarSystemId(null);
    setFlightEnabled(false);
    setFlightTargetId(null);
    setAutopilotTargetId(null);
    setFlightInput(neutralInput);
    changeMenu(false);
    tour.start(prepared);
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
    setSelectedStarSystemId(null);
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
  const selectStar = () => {
    if (flightEnabled || activeSystem?.kind !== "system") return;
    cancelTour();
    navigate(activeSystem.id);
    setSelectedStarSystemId(activeSystem.id);
    setStarFocusToken((token) => token + 1);
  };
  const guideTo = (id: string) => {
    const destination = getEntity(catalog, id);
    if (!flightEnabled || destination?.kind !== "planet" || destination.parentId !== activeSystem?.id) return;
    setAutopilotTargetId((previous) => previous === id ? null : id);
  };
  const goWider = () => { if (parent) goTo(parent.id); };
  const goWiderManually = goWider;
  const toggleFlight = () => {
    setSelectedStarSystemId(null);
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
  const prepareManagement = () => {
    cancelTour();
    setSelectedStarSystemId(null);
    setFlightEnabled(false);
    setFlightTargetId(null);
    setAutopilotTargetId(null);
  };

  return (
    <main className="universe-page universe-minimal" aria-label={copy.title} data-scale={current.kind} data-flight={flightEnabled} data-flight-status={flightStatus} data-tour-phase={tour.phase} data-tour-active={tour.active} data-audio-toggle={Boolean(audio?.Toggle)}>
      <div className="universe-scene" inert={tour.awaitingStart} aria-busy={sceneStatus === "loading"}>
        <Scene view={view} selectedId={planet?.id ?? null} playing={!blocked && !tour.awaitingStart} showOrbits={showOrbits} autoOrbit={tour.active || autoOrbit} resetToken={resetToken} zoomAction={null} onSelect={selectSceneNode} onReady={onReady} onUnavailable={onUnavailable} ariaLabel={copy.canvas} flightEnabled={flightEnabled} flightPaused={blocked} flightInput={flightInput} onFlightStatus={onFlightStatus} flightTargetId={flightEnabled ? flightTargetId : null} autopilotTargetId={flightEnabled ? autopilotTargetId : null} guideActionLabel={autopilotTargetId === flightTargetId && autopilotTargetId ? copy.cancelGuidance : copy.guideShip} onGuideRequest={guideTo} onAutopilotEnd={onAutopilotEnd} hasParentView={Boolean(parent)} onScaleOut={goWider} onScaleIn={goTo} tourPreparing={tour.phase === "waiting" && tour.currentStep?.motion === "approach"} tourStep={tour.active && tour.token === tourCameraStep?.token ? tourCameraStep : null} onTourArrive={tour.arrive} onTourZoomIntent={tourZoomFeedback} onTourZoomEnd={stopTourZoomFeedback} onInteraction={cancelTour} onZoomIntent={zoomFeedback} onOrbitIntent={orbitFeedback} onCameraGestureEnd={stopCameraFeedback} onDestinationHover={hoverFeedback} starSelected={starSelected} starFocusToken={starFocusToken} onSelectStar={selectStar} entityTransition={management?.entityTransition} onEntityTransitionEnd={management?.onEntityTransitionEnd} />
      </div>
      <div className="universe-vignette" aria-hidden="true" />
      {audio?.Toggle && <div className="universe-audio-toggle"><audio.Toggle /></div>}
      <div ref={hud} className="universe-hud" hidden={tour.active || tour.awaitingStart}>
        {location?.Status && <location.Status />}
        {management && <management.Actions target={{ kind: current.kind, id: current.id }} onInteraction={prepareManagement} disabled={menuOpen || shareOpen} share={location ? { label: copy.menuGroups.sharing, onSelect: () => setShareOpen(true) } : undefined} />}
        {management?.EmptyState && !blocked && !tour.active && !flightEnabled && sceneStatus === "ready" && current.kind !== "planet" && view.nodes.length === 0 && <management.EmptyState target={{ kind: current.kind, id: current.id }} onInteraction={prepareManagement} />}
        <header className="universe-topbar">
          <div className="universe-brand universe-brand-static"><BrandLogo size={32} eager /><span>HackUniverse<small>{catalog.mode === "demo" ? copy.demo : copy.title}</small></span></div>
          <div className="universe-context" aria-live="polite"><span>{copy.kinds[current.kind]}</span><h1>{current.name}</h1></div>
          <ExplorerMenu catalog={catalog} copy={copy} open={menuOpen} onOpenChange={changeMenu} currentTarget={{ kind: current.kind, id: current.id }} onNavigate={goTo} discoveryTarget={discoveryTarget} showOrbits={showOrbits} onToggleOrbits={() => setShowOrbits((value) => !value)} autoOrbit={autoOrbit} onToggleAutoOrbit={() => setAutoOrbit((value) => !value)} onResetCamera={() => setResetToken((value) => value + 1)} resetAvailable={sceneStatus === "ready" && !flightEnabled} flightEnabled={flightEnabled} flightAvailable={Boolean(activeSystem) && sceneStatus === "ready"} flightStatus={flightStatus} onToggleFlight={toggleFlight} tourAvailable={tourAvailable && sceneStatus === "ready"} onStartTour={startTour} onCloseAutoFocus={(event) => { if (tour.active) { event.preventDefault(); skipTourButton.current?.focus({ preventScroll: true }); } }} LanguagePicker={LanguagePicker} DesignLink={DesignLink} DataControls={management?.Controls} AudioControls={audio?.Controls} />
        </header>
        {(sceneStatus === "loading" || flightStatus === "loading") && <div className="universe-scene-state" role="status"><Orbit className="universe-loading-orbit" size={24} aria-hidden="true" /><p>{flightStatus === "loading" ? copy.flightLoading : copy.loading}</p></div>}
        {sceneStatus === "unavailable" && <section className="universe-scene-state universe-fallback" role="status"><h2>{copy.fallbackTitle}</h2><p>{copy.fallbackDescription}</p><Button className="hud-button" data-audio-ignore="true" onClick={() => changeMenu(true)}>{copy.library}</Button></section>}
        {flightStatus === "error" && <button type="button" data-audio-ignore="true" className="universe-flight-error" onClick={() => changeMenu(true)}>{copy.flightError}</button>}
        {planet && !flightEnabled && !tour.active && <PlanetDetails planet={planet} copy={copy} onBack={goWiderManually} demo={catalog.mode === "demo" || planet.type === "demo"} allowDemoReferences={allowDemoReferences} actions={management && <management.SelectionActions target={{ kind: "planet", id: planet.id }} onInteraction={prepareManagement} />} />}
        {selectedStar && !flightEnabled && !tour.active && <StarDetails star={selectedStar} systemName={current.name} planetCount={getPlanetCount(catalog, current.id)} copy={copy} onClose={() => setSelectedStarSystemId(null)} formatNumber={formatNumber} demo={catalog.mode === "demo" || current.type === "demo"} />}
        {parent && <Button type="button" variant="outline" data-audio-ignore="true" className="hud-button universe-scale-back" onClick={goWiderManually} title={`${copy.wider}: ${copy.kinds[parent.kind]}`}><Layers3 aria-hidden="true" /><span>{copy.kinds[parent.kind]}</span></Button>}
        {flightEnabled && !blocked && <><FlightControls copy={copy} onInput={setFlightInput} /><Button type="button" variant="outline" className="hud-button universe-flight-exit" onClick={() => setFlightEnabled(false)}><ArrowLeft aria-hidden="true" />{copy.exitFlight}</Button></>}
      </div>
      {location && <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent {...shareFocus} className="universe-menu-category-dialog" closeLabel={copy.close} aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{copy.menuGroups.sharing}</DialogTitle></DialogHeader>
          <div className="universe-menu-category-dialog__options"><location.Controls /></div>
        </DialogContent>
      </Dialog>}
      {tour.awaitingStart && <div className="universe-tour-entry">
        <Panel as="section" className="universe-tour-entry__panel" aria-label={copy.tourTitle}>
          <p className="hud-kicker">HackUniverse</p>
          <h2>{copy.tourWelcome}</h2>
          <p>{copy.tourDescription}</p>
          <Button ref={startTourButton} type="button" onClick={() => { unlockTourAudio(); tour.start(); }}>{copy.tourStart}</Button>
        </Panel>
      </div>}
      <div className="universe-tour-status" hidden={!tour.active}>
        <p role="status" aria-atomic="true">{copy.tourTitle} · {current.name}</p>
        <Button ref={skipTourButton} type="button" variant="outline" className="hud-button" onClick={() => { stopTourZoomFeedback(); cancelTour(); }}>{copy.tourSkip}</Button>
      </div>
    </main>
  );
}
