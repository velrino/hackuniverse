import { ArrowLeft, ArrowUpRight, CircleDot, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { TypewriterText } from "@/components/ui/typewriter-text";
import type { UniversePlanet } from "../../domain/types";
import type { UniverseCopy } from "../../messages";
import type { ReactNode } from "react";

export function PlanetDetails({ planet, copy, onBack, demo, actions }: { planet: UniversePlanet; copy: UniverseCopy; onBack: () => void; demo: boolean; actions?: ReactNode }) {
  const reference = planet.reference;
  const SourceIcon = reference?.href ? Link2 : CircleDot;

  return (
    <Panel as="section" className="universe-details" aria-label={planet.name}>
      <p className="hud-kicker">{copy.kinds.planet} / {reference ? copy.source : copy.details}</p>
      <h2><TypewriterText text={planet.name} replayKey={planet.id} /></h2>
      <p className="universe-details-description"><TypewriterText text={planet.description} replayKey={planet.id} /></p>
      {reference && <div className="universe-source"><SourceIcon size={15} aria-hidden="true" /><span>{reference.label}</span></div>}
      {demo && reference && <p className="universe-source-note">{copy.demoReference}</p>}
      <div className="universe-details-actions">
        {actions}
        <Button type="button" variant="outline" className="hud-button" onClick={onBack}><ArrowLeft aria-hidden="true" />{copy.parentSystem}</Button>
        {!demo && reference?.href && <Button asChild className="hud-button"><a href={reference.href} target="_blank" rel="noopener noreferrer">{copy.openReference}<ArrowUpRight aria-hidden="true" /></a></Button>}
      </div>
    </Panel>
  );
}
