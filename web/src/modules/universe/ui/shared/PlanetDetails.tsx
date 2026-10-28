import { ArrowLeft, ArrowUpRight, Globe2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HudPanel } from "@/components/ui/hud-panel";
import type { WebsitePlanet } from "../../domain/types";
import type { UniverseCopy } from "../../messages";

export function PlanetDetails({ planet, copy, onBack }: { planet: WebsitePlanet; copy: UniverseCopy; onBack: () => void }) {
  const source = new URL(planet.source.url);
  const illustrative = source.hostname.endsWith(".example");
  const safeLink = source.protocol === "https:" && !source.username && !source.password && !illustrative;

  return (
    <HudPanel as="section" className="universe-details" aria-label={planet.name}>
      <p className="hud-kicker">{copy.kinds.planet} / {copy.source}</p>
      <h2>{planet.source.title}</h2>
      <p className="universe-details-description">{planet.source.description}</p>
      <div className="universe-source"><Globe2 size={15} aria-hidden="true" /><span>{source.hostname}</span></div>
      {illustrative && <p className="universe-source-note">{copy.demoUrl}</p>}
      <div className="universe-details-actions">
        <Button type="button" variant="outline" className="hud-button" onClick={onBack}><ArrowLeft aria-hidden="true" />{copy.parentSystem}</Button>
        {safeLink && <Button asChild className="hud-button"><a href={source.href} target="_blank" rel="noopener noreferrer">{copy.viewWebsite}<ArrowUpRight aria-hidden="true" /></a></Button>}
      </div>
    </HudPanel>
  );
}
