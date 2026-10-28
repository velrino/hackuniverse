import type { ReactNode } from "react";
import { HudPanel } from "@/components/ui/hud-panel";
import { TabsContent } from "@/components/ui/tabs";
import type { ShowcaseSectionId } from "../../configs/showcase";

export function DesignSection({
  id, title, description, children, tabbed, active,
}: {
  id: ShowcaseSectionId;
  title: string;
  description: string;
  children: ReactNode;
  tabbed: boolean;
  active: boolean;
}) {
  return (
    <TabsContent
      value={id} id={`design-panel-${id}`} forceMount
      hidden={tabbed && !active} role={tabbed ? "tabpanel" : undefined}
      aria-labelledby={tabbed ? `design-tab-${id}` : `${id}-title`}
      tabIndex={tabbed ? 0 : -1} className="design-section-panel"
    >
      <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="hud-anchor-target">
        <h2 id={`${id}-title`} className="hud-title mb-3 text-2xl">{title}</h2>
        <p className="mb-6 max-w-3xl text-sm leading-7 text-[var(--hud-muted)]">{description}</p>
        <HudPanel as="div" className="p-6 sm:p-8">{children}</HudPanel>
      </section>
    </TabsContent>
  );
}
