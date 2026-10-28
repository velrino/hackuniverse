import type { ReactNode } from "react";
import { HudPanel } from "@/components/ui/hud-panel";

export function DesignSection({
  id, title, description, children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="hud-anchor-target">
      <h2 id={`${id}-title`} className="hud-title mb-3 text-2xl">{title}</h2>
      <p className="mb-6 max-w-3xl text-sm leading-7 text-[var(--hud-muted)]">{description}</p>
      <HudPanel as="div" className="p-6 sm:p-8">{children}</HudPanel>
    </section>
  );
}
