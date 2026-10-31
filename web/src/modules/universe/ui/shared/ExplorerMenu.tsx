"use client";

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, ChevronLeft, ChevronRight, Compass, Database, Eye, Languages, Menu, Orbit, Play, Rocket, RotateCcw, RotateCw, Search, Volume2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBreadcrumbs, searchPlanets } from "../../domain/catalog";
import type { NavigationTarget, UniverseCatalog } from "../../domain/types";
import type { UniverseManagement } from "../../adapters/types";
import { getPlanetAppearance } from "../../domain/planet-appearance";
import type { UniverseCopy } from "../../messages";
import { MenuAbout } from "./MenuAbout";
import "./menu.css";
import "./menu-navigation.css";

const ATLAS_PAGE_SIZE = 24;
type MenuTab = "pause" | "go-to" | "settings" | "about";

export type ExplorerMenuProps = {
  catalog: UniverseCatalog;
  copy: UniverseCopy;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (id: string) => void;
  currentTarget: NavigationTarget;
  showOrbits: boolean;
  onToggleOrbits: () => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  resetAvailable: boolean;
  onResetCamera: () => void;
  flightEnabled: boolean;
  flightAvailable: boolean;
  flightStatus: "idle" | "loading" | "ready" | "error";
  onToggleFlight: () => void;
  tourAvailable: boolean;
  onStartTour: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  LanguagePicker: ComponentType;
  DesignLink: ComponentType<{ children: ReactNode; className?: string }>;
  DataControls?: UniverseManagement["Controls"];
  AudioControls?: ComponentType;
};

type MenuContentsProps = ExplorerMenuProps & {
  query: string;
  page: number;
  setQuery: (query: string) => void;
  setPage: (page: number) => void;
};

/** Native nested dialogs preserve the paused parent and return focus to each row. */
function SettingsCategory({ title, icon, closeLabel, children }: { title: string; icon: ReactNode; closeLabel: string; children: ReactNode }) {
  return <Dialog>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" className="hud-option universe-menu-category">
        {icon}<span>{title}</span><ChevronRight aria-hidden="true" />
      </Button>
    </DialogTrigger>
    <DialogContent className="universe-menu-category-dialog" closeLabel={closeLabel} aria-describedby={undefined}>
      <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
      <div className="universe-menu-category-dialog__options">{children}</div>
    </DialogContent>
  </Dialog>;
}

export function ExplorerMenu(props: ExplorerMenuProps) {
  const { copy, open, onOpenChange } = props;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" data-dialog-return-focus data-audio-ignore="true" className="hud-button universe-menu-trigger" aria-label={copy.menu} title={copy.menu}>
          <Menu aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent className="universe-explorer-menu" closeLabel={copy.close} data-audio-menu="true" onCloseAutoFocus={props.onCloseAutoFocus}>
        <DialogHeader className="universe-explorer-menu__header">
          <DialogTitle className="hud-title">{copy.menuTitle}</DialogTitle>
          <DialogDescription>{copy.menuDescription}</DialogDescription>
        </DialogHeader>
        {open && <MenuContents {...props} query={query} page={page} setQuery={setQuery} setPage={setPage} />}
      </DialogContent>
    </Dialog>
  );
}

/** Opening mounts fresh tab navigation while the parent retains the atlas draft. */
function MenuContents({ catalog, copy, onOpenChange, onNavigate, currentTarget, showOrbits, onToggleOrbits, autoOrbit, onToggleAutoOrbit, resetAvailable, onResetCamera, flightEnabled, flightAvailable, flightStatus, onToggleFlight, tourAvailable, onStartTour, LanguagePicker, DesignLink, DataControls, AudioControls, query, page, setQuery, setPage }: MenuContentsProps) {
  const [tab, setTab] = useState<MenuTab>("pause");
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
  const breadcrumbs = getBreadcrumbs(catalog, currentTarget.id);
  const navigate = (targetId: string) => { onNavigate(targetId); onOpenChange(false); };

  return (
    <Tabs value={tab} onValueChange={(value) => { if (value === "pause" || value === "go-to" || value === "settings" || value === "about") setTab(value); }} className="universe-menu-tabs universe-menu-tabs--pause">
      <TabsList className="universe-menu-tablist" aria-label={copy.menuTitle}>
        <TabsTrigger value="pause" title={copy.tabs.pause}>{copy.tabs.pause}</TabsTrigger>
        <TabsTrigger value="go-to" title={copy.tabs.goTo}>{copy.tabs.goTo}</TabsTrigger>
        <TabsTrigger value="settings" title={copy.tabs.settings}>{copy.tabs.settings}</TabsTrigger>
        <TabsTrigger value="about" title={copy.tabs.about}>{copy.tabs.about}</TabsTrigger>
      </TabsList>

      <TabsContent value="pause" className="universe-menu-panel universe-menu-pause">
        <div className="universe-menu-pause__actions">
          <Button type="button" className="hud-button universe-menu-action" onClick={() => onOpenChange(false)}>
            <Play aria-hidden="true" />{copy.menuActions.resume}
          </Button>
          <Button type="button" variant="outline" className="hud-button universe-menu-action" disabled={!tourAvailable} onClick={onStartTour}>
            <Orbit aria-hidden="true" />{copy.tourTitle}
          </Button>
          <Button type="button" variant="outline" className="hud-button universe-menu-action" disabled={!resetAvailable} onClick={() => { onResetCamera(); onOpenChange(false); }}>
            <RotateCcw aria-hidden="true" />{copy.menuActions.reset}
          </Button>
          <Button type="button" variant="outline" className="hud-button universe-menu-action" onClick={() => onOpenChange(false)}>
            <X aria-hidden="true" />{copy.close}
          </Button>
        </div>
      </TabsContent>

      <TabsContent value="go-to" className="universe-menu-panel universe-menu-atlas">
        <nav className="universe-menu-location" aria-label={copy.location}>
          {breadcrumbs.map((entity, index) => (
            <span key={entity.id}>
              {index > 0 && <ChevronRight size={12} aria-hidden="true" />}
              <button type="button" onClick={() => navigate(entity.id)} aria-current={entity.id === currentTarget.id ? "location" : undefined} title={`${copy.kinds[entity.kind]}: ${entity.name}`}>
                {entity.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="universe-menu-search">
          <label htmlFor={searchId} className="sr-only">{copy.searchLabel}</label>
          <Search size={18} aria-hidden="true" />
          <Input id={searchId} className="w-full" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={copy.searchPlaceholder} autoComplete="off" />
        </div>
        <p className="universe-menu-result-count" role="status">{copy.results}: {results.length} / {catalog.planets.length}</p>
        {results.length === 0 ? <p className="universe-menu-empty">{copy.noResults}</p> : (
          <ul ref={resultsList} id={resultsId} className="universe-menu-planets">
            {visibleResults.map((planet) => (
              <li key={planet.id}>
                <button type="button" onClick={() => navigate(planet.id)} aria-current={planet.id === currentTarget.id ? "location" : undefined}>
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

      <TabsContent value="settings" className="universe-menu-panel universe-menu-options">
        <SettingsCategory title={copy.menuGroups.language} icon={<Languages aria-hidden="true" />} closeLabel={copy.close}>
          <div className="universe-menu-language"><LanguagePicker /></div>
        </SettingsCategory>
        {AudioControls && <SettingsCategory title={copy.menuGroups.sound} icon={<Volume2 aria-hidden="true" />} closeLabel={copy.close}>
          <AudioControls />
        </SettingsCategory>}
        {DataControls && <SettingsCategory title={copy.menuGroups.workspace} icon={<Database aria-hidden="true" />} closeLabel={copy.close}>
          <DataControls target={currentTarget} onRequestClose={() => onOpenChange(false)} />
        </SettingsCategory>}
        <SettingsCategory title={copy.menuGroups.view} icon={<Eye aria-hidden="true" />} closeLabel={copy.close}>
          <div className="universe-menu-group">
            <Button type="button" variant="outline" className="hud-button universe-menu-action" aria-pressed={showOrbits} onClick={onToggleOrbits}>
              <Orbit aria-hidden="true" />{showOrbits ? copy.hideOrbits : copy.orbits}
            </Button>
            <Button type="button" variant="outline" className="hud-button universe-menu-action" aria-pressed={autoOrbit} onClick={onToggleAutoOrbit}>
              <RotateCw aria-hidden="true" />{copy.autoOrbit}
            </Button>
          </div>
        </SettingsCategory>
        <SettingsCategory title={copy.menuGroups.flight} icon={<Rocket aria-hidden="true" />} closeLabel={copy.close}>
          <div className="universe-menu-group">
            <Button type="button" variant="outline" className="hud-button universe-menu-action" disabled={!flightAvailable || flightStatus === "loading"} aria-pressed={flightEnabled} aria-describedby={flightHintId} onClick={() => { onToggleFlight(); onOpenChange(false); }}>
              <Rocket aria-hidden="true" />{flightStatus === "loading" ? copy.flightLoading : flightEnabled ? copy.exitFlight : copy.enterFlight}
            </Button>
            <p id={flightHintId}>{flightAvailable ? copy.flightHint : copy.flightUnavailable}</p>
            {flightStatus === "error" && <p role="alert">{copy.flightError}</p>}
            <p>{copy.flightKeys}</p>
          </div>
        </SettingsCategory>
        <SettingsCategory title={copy.guide} icon={<Compass aria-hidden="true" />} closeLabel={copy.close}>
          <div className="universe-menu-group">
            <p className="universe-guide-desktop">{copy.guideDesktop}</p>
            <p className="universe-guide-touch">{copy.guideTouch}</p>
            <p>{copy.guideGroups}</p>
          </div>
        </SettingsCategory>
        <SettingsCategory title={copy.menuGroups.resources} icon={<BookOpen aria-hidden="true" />} closeLabel={copy.close}>
          <DesignLink className="universe-menu-design-link">{copy.design}<ArrowUpRight size={16} aria-hidden="true" /></DesignLink>
        </SettingsCategory>
      </TabsContent>

      <TabsContent value="about" className="universe-menu-panel universe-menu-about-panel">
        <MenuAbout copy={copy} demo={catalog.mode === "demo"} />
      </TabsContent>
    </Tabs>
  );
}
