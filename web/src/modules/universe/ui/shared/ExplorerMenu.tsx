"use client";

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, ChevronLeft, ChevronRight, Menu, Orbit, Rocket, RotateCcw, RotateCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBreadcrumbs, searchPlanets } from "../../domain/catalog";
import type { UniverseCatalog } from "../../domain/types";
import { getPlanetAppearance } from "../../domain/planet-appearance";
import type { UniverseCopy } from "../../messages";
import "./menu.css";

const ATLAS_PAGE_SIZE = 24;

export type ExplorerMenuProps = {
  catalog: UniverseCatalog;
  copy: UniverseCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: string) => void;
  currentId: string;
  showOrbits: boolean;
  onToggleOrbits: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  onResetCamera: () => void;
  flightEnabled: boolean;
  flightAvailable: boolean;
  flightStatus: "idle" | "loading" | "ready" | "error";
  onToggleFlight: () => void;
  LanguagePicker: ComponentType;
  DesignLink: ComponentType<{ children: ReactNode; className?: string }>;
};

export function ExplorerMenu({ catalog, copy, open, onOpenChange, onNavigate, currentId, showOrbits, onToggleOrbits, autoOrbit, onToggleAutoOrbit, onResetCamera, flightEnabled, flightAvailable, flightStatus, onToggleFlight, LanguagePicker, DesignLink }: ExplorerMenuProps) {
  const [tab, setTab] = useState("atlas");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const resultsList = useRef<HTMLUListElement>(null);
  const id = useId();
  const searchId = `${id}-search`;
  const resultsId = `${id}-results`;
  const flightHintId = `${id}-flight-hint`;
  const results = useMemo(() => searchPlanets(catalog, query), [catalog, query]);
  const pageCount = Math.max(1, Math.ceil(results.length / ATLAS_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleResults = results.slice(currentPage * ATLAS_PAGE_SIZE, (currentPage + 1) * ATLAS_PAGE_SIZE);
  useEffect(() => { if (resultsList.current) resultsList.current.scrollTop = 0; }, [currentPage, query]);
  const breadcrumbs = getBreadcrumbs(catalog, currentId);
  const navigate = (targetId: string) => { onNavigate(targetId); onOpenChange(false); };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="hud-button universe-menu-trigger" aria-label={copy.menu} title={copy.menu}>
          <Menu aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="universe-explorer-menu" closeLabel={copy.close}>
        <DialogHeader className="universe-explorer-menu__header">
          <DialogTitle className="hud-title">{copy.menuTitle}</DialogTitle>
          <DialogDescription className="sr-only">{copy.menuDescription}</DialogDescription>
        </DialogHeader>

        <nav className="universe-menu-location" aria-label={copy.location}>
          {breadcrumbs.map((entity, index) => (
            <span key={entity.id}>
              {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
              <button type="button" onClick={() => navigate(entity.id)} aria-current={entity.id === currentId ? "location" : undefined} title={`${copy.kinds[entity.kind]}: ${entity.name}`}>
                {entity.name}
              </button>
            </span>
          ))}
        </nav>

        <Tabs value={tab} onValueChange={setTab} className="universe-menu-tabs">
          <TabsList className="universe-menu-tablist" aria-label={copy.menuTitle}>
            {(["atlas", "view", "controls", "settings"] as const).map((value) => (
              <TabsTrigger key={value} value={value} title={copy.tabs[value]}><span>{copy.tabs[value]}</span></TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="atlas" className="universe-menu-panel universe-menu-atlas">
            <div className="universe-menu-search">
              <label htmlFor={searchId} className="sr-only">{copy.searchLabel}</label>
              <Search size={18} aria-hidden="true" />
              <input id={searchId} className="hud-input" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={copy.searchPlaceholder} autoComplete="off" />
            </div>
            <p className="universe-menu-result-count" role="status">{copy.results}: {results.length} / {catalog.planets.length}</p>
            {results.length === 0 ? <p className="universe-menu-empty">{copy.noResults}</p> : (
              <ul ref={resultsList} id={resultsId} className="universe-menu-planets">
                {visibleResults.map((planet) => (
                  <li key={planet.id}>
                    <button type="button" onClick={() => navigate(planet.id)} aria-current={planet.id === currentId ? "location" : undefined}>
                      <span className="universe-menu-planet-orb" style={{ "--planet-color": getPlanetAppearance(planet.seed).color } as CSSProperties} aria-hidden="true" />
                      <span className="universe-menu-planet-text"><strong>{planet.name}</strong><small>{getBreadcrumbs(catalog, planet.id).filter((entity) => entity.kind === "cloud" || entity.kind === "system").map((entity) => entity.name).join(" / ")}</small></span>
                      <ArrowUpRight size={16} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {pageCount > 1 && (
              <nav className="universe-menu-pagination" aria-label={copy.atlasPages}>
                <Button type="button" variant="outline" className="hud-button" disabled={currentPage === 0} aria-controls={resultsId} onClick={() => setPage(currentPage - 1)}><ChevronLeft aria-hidden="true" />{copy.previousPage}</Button>
                <p aria-live="polite">{copy.page} {currentPage + 1} / {pageCount}</p>
                <Button type="button" variant="outline" className="hud-button" disabled={currentPage === pageCount - 1} aria-controls={resultsId} onClick={() => setPage(currentPage + 1)}>{copy.nextPage}<ChevronRight aria-hidden="true" /></Button>
              </nav>
            )}
          </TabsContent>

          <TabsContent value="view" className="universe-menu-panel universe-menu-options">
            <Button type="button" variant="outline" className="hud-button universe-menu-action" aria-pressed={showOrbits} onClick={onToggleOrbits}>
              <Orbit aria-hidden="true" />{showOrbits ? copy.hideOrbits : copy.orbits}
            </Button>
            <Button type="button" variant="outline" className="hud-button universe-menu-action" aria-pressed={autoOrbit} onClick={onToggleAutoOrbit}>
              <RotateCw aria-hidden="true" />{copy.autoOrbit}
            </Button>
            <Button type="button" variant="outline" className="hud-button universe-menu-action" onClick={() => { onResetCamera(); onOpenChange(false); }}>
              <RotateCcw aria-hidden="true" />{copy.reset}
            </Button>
          </TabsContent>

          <TabsContent value="controls" className="universe-menu-panel universe-menu-options">
            <Button type="button" variant="outline" className="hud-button universe-menu-action" disabled={!flightAvailable || flightStatus === "loading"} aria-pressed={flightEnabled} aria-describedby={flightHintId} onClick={() => { onToggleFlight(); onOpenChange(false); }}>
              <Rocket aria-hidden="true" />{flightStatus === "loading" ? copy.flightLoading : flightEnabled ? copy.exitFlight : copy.enterFlight}
            </Button>
            <p id={flightHintId}>{flightAvailable ? copy.flightHint : copy.flightUnavailable}</p>
            {flightStatus === "error" && <p role="alert">{copy.flightError}</p>}
            <p>{copy.flightKeys}</p>
            <div className="hud-rule" aria-hidden="true" />
            <p className="universe-guide-desktop">{copy.guideDesktop}</p>
            <p className="universe-guide-touch">{copy.guideTouch}</p>
            <p>{copy.guideGroups}</p>
          </TabsContent>

          <TabsContent value="settings" className="universe-menu-panel universe-menu-options">
            <div className="universe-menu-language"><LanguagePicker /></div>
            <DesignLink className="universe-menu-design-link">{copy.design}<ArrowUpRight size={16} aria-hidden="true" /></DesignLink>
            <p className="universe-menu-credit"><a href="https://sketchfab.com/3d-models/space-ship-356a3acb00164c698d657146caa5ebf3" target="_blank" rel="noopener noreferrer">{copy.shipCredit}</a> <a href="https://sketchfab.com/yanix" target="_blank" rel="noopener noreferrer">yanix</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
            <p>{copy.demoHint}</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
