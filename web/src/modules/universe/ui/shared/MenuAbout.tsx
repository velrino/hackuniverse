import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UniverseCopy } from "../../messages";

export function MenuAbout({ copy, demo }: { copy: UniverseCopy; demo: boolean }) {
  return <div className="universe-menu-about">
    <p className="hud-kicker">{copy.about.credit}</p>
    <h3>{copy.about.author}</h3>
    <p>{copy.about.intro}</p>
    <div className="universe-menu-about-links">
      <Button asChild className="universe-menu-about-link">
        <a href="https://github.com/velrino/hackuniverse" target="_blank" rel="noopener noreferrer">
          <span><strong>{copy.about.source}</strong><small>{copy.about.sourceDescription}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
      <Button asChild variant="outline" className="universe-menu-about-link">
        <a href="https://github.com/velrino/" target="_blank" rel="noopener noreferrer">
          <span><strong>GitHub</strong><small>{copy.about.githubDescription}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
      <Button asChild variant="outline" className="universe-menu-about-link">
        <a href="https://www.linkedin.com/in/velrino/" target="_blank" rel="noopener noreferrer">
          <span><strong>LinkedIn</strong><small>{copy.about.linkedinDescription}</small></span>
          <ArrowUpRight aria-hidden="true" />
        </a>
      </Button>
    </div>
    <section className="universe-menu-credits" aria-label={copy.about.credits}>
      <h4>{copy.about.credits}</h4>
      <p className="universe-menu-credit"><a href="https://sketchfab.com/3d-models/space-ship-356a3acb00164c698d657146caa5ebf3" target="_blank" rel="noopener noreferrer">{copy.shipCredit}</a> <a href="https://sketchfab.com/yanix" target="_blank" rel="noopener noreferrer">yanix</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a></p>
    </section>
    {demo && <p className="universe-menu-demo-note">{copy.demoHint}</p>}
  </div>;
}
