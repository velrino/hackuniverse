import { ArrowLeft, ArrowUpRight, CircleDot, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HudPanel } from "@/components/ui/hud-panel";
import { TypewriterText } from "@/components/ui/typewriter-text";
import type { SystemStar } from "../../domain/types";
import type { UniverseCopy } from "../../messages";

export type StarDetailsProps = {
  star: SystemStar;
  systemName: string;
  planetCount: number;
  copy: UniverseCopy;
  onClose: () => void;
  formatNumber?: (value: number) => string;
  demo?: boolean;
};

export function StarDetails({ star, systemName, planetCount, copy, onClose, formatNumber = String, demo = false }: StarDetailsProps) {
  const replayKey = `${systemName}:${star.name}`;
  const facts = [
    { label: copy.starSystem, value: systemName },
    { label: copy.starPlanets, value: formatNumber(planetCount) },
  ];
  if (star.spectralType) facts.push({ label: copy.starSpectralType, value: star.spectralType });
  if (star.temperatureK !== undefined) facts.push({ label: copy.starTemperature, value: `${formatNumber(star.temperatureK)} K` });
  if (star.radiusKm !== undefined) facts.push({ label: copy.starRadius, value: `${formatNumber(star.radiusKm)} km` });
  if (star.ageBillionYears !== undefined) facts.push({
    label: copy.starAge,
    value: `${formatNumber(star.ageBillionYears)} ${copy.starBillionYears[star.ageBillionYears === 1 ? "one" : "other"]}`,
  });
  const reference = star.reference;
  const SourceIcon = reference?.href ? Link2 : CircleDot;

  return (
    <HudPanel as="section" className="universe-details" aria-label={star.name}>
      <p className="hud-kicker">{copy.star} / {copy.details}{demo && <> / {copy.demoObject}</>}</p>
      <h2><TypewriterText text={star.name} replayKey={replayKey} /></h2>
      <p className="universe-details-description"><TypewriterText text={star.description.trim() || copy.starFallbackDescription} replayKey={replayKey} /></p>
      <dl className="universe-star-facts">
        {facts.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      {reference && <div className="universe-source"><SourceIcon size={15} aria-hidden="true" /><span>{reference.label}</span></div>}
      <div className="universe-details-actions">
        <Button type="button" variant="outline" className="hud-button" onClick={onClose}><ArrowLeft aria-hidden="true" />{copy.starClose}</Button>
        {reference?.href && <Button asChild className="hud-button"><a href={reference.href} target="_blank" rel="noopener noreferrer" aria-label={`${copy.starSource}: ${reference.label}`}>{copy.starSource}<ArrowUpRight aria-hidden="true" /></a></Button>}
      </div>
    </HudPanel>
  );
}
