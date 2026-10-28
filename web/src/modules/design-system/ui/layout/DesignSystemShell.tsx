import type { MouseEvent, ReactNode } from "react";
import { AnchorLink } from "@/components/ui/anchor-link";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DesignSystemCopy } from "../../messages";
import { sectionOrder, type ShowcaseMode, type ShowcaseSectionId } from "../../configs/showcase";
import "./showcase-navigation.css";

type Navigation = {
  mode: ShowcaseMode;
  activeSection: ShowcaseSectionId;
  changeMode: (mode: ShowcaseMode) => void;
  changeSection: (section: string) => void;
  onAnchorClick: (event: MouseEvent<HTMLElement>) => void;
  onTabListMount: (element: HTMLDivElement | null) => void;
};

export function DesignSystemShell({ copy, mode, activeSection, changeMode, changeSection, onAnchorClick, onTabListMount, children }: Navigation & { copy: DesignSystemCopy; children: ReactNode }) {
  const tabbed = mode === "tabs";
  return (
    <main className="mx-auto min-w-0 w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-20">
      <header className="max-w-3xl">
        <p className="hud-kicker mb-4">{copy.eyebrow}</p>
        <h1 className="hud-title text-4xl sm:text-5xl">{copy.title}</h1>
        <p className="mt-5 text-base leading-8 text-[var(--hud-muted)]">{copy.description}</p>
      </header>
      <Tabs value={activeSection} onValueChange={changeSection} className="min-w-0 gap-0" onClickCapture={onAnchorClick}>
        <div className="my-8 flex flex-wrap items-center justify-between gap-4">
          <p className="hud-kicker">{copy.viewMode.label}</p>
          <div role="group" aria-label={copy.viewMode.label} className="flex max-w-full gap-2">
            {(["page", "tabs"] as const).map((value) => <Button key={value} type="button" variant="outline" className="hud-option min-h-11" data-selected={mode === value} aria-pressed={mode === value} onClick={() => changeMode(value)}>{copy.viewMode[value]}</Button>)}
          </div>
        </div>
        <nav aria-label={copy.navigation} hidden={tabbed} className="design-showcase-anchors mb-9 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs">
          {sectionOrder.map((id) => <AnchorLink key={id} href={`#${id}`} className="hud-nav-link inline-flex min-h-11 items-center py-2">{copy.sections[id]}</AnchorLink>)}
        </nav>
        <div hidden={!tabbed} className="design-showcase-tab-strip mb-9">
          <TabsList ref={onTabListMount} aria-label={copy.navigation} className="w-max min-w-full justify-start">
            {sectionOrder.map((id) => <TabsTrigger key={id} id={`design-tab-${id}`} aria-controls={`design-panel-${id}`} data-section={id} value={id} className="min-h-11 shrink-0 whitespace-nowrap">{copy.sections[id]}</TabsTrigger>)}
          </TabsList>
        </div>
        <div className="grid min-w-0 gap-14">{children}</div>
      </Tabs>
    </main>
  );
}
