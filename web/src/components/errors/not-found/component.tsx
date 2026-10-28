import type { ReactNode } from "react";
import { HudPanel } from "@/components/ui/hud-panel";
import "./not-found.css";

export type NotFoundCopy = {
  eyebrow: string;
  title: string;
  description: string;
  home: string;
};

export function NotFoundPage({ copy, action }: { copy: NotFoundCopy; action: ReactNode }) {
  return (
    <main className="not-found-page" aria-labelledby="not-found-title">
      <HudPanel as="div" className="not-found-panel">
        <div className="not-found-visual" aria-hidden="true">
          <span className="not-found-axis" />
          <p className="not-found-code">404</p>
        </div>
        <div className="not-found-copy">
          <p className="hud-kicker not-found-eyebrow">{copy.eyebrow}</p>
          <h1 id="not-found-title" className="hud-title not-found-title">{copy.title}</h1>
          <p className="not-found-description">{copy.description}</p>
          <div className="not-found-action">{action}</div>
        </div>
      </HudPanel>
    </main>
  );
}
