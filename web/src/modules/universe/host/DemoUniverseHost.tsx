"use client";

import { mockCatalog } from "../adapters/catalog";
import { UniverseWorkspaceHost } from "@/modules/universe-workspace";
import type { UniverseTourDefinition } from "../adapters/types";
import { useTranslations } from "@/i18n";

const tour: UniverseTourDefinition = {
  storageKey: "hackuniverse.demo-tour.v1.seen",
  steps: [
    { target: { kind: "planet", id: "planet-earth" }, holdMs: 3000 },
    { target: { kind: "system", id: "system-solar" } },
    { target: { kind: "cloud", id: "cloud-local-interstellar" } },
    { target: { kind: "galaxy", id: "galaxy-milky-way" } },
    { target: { kind: "universe", id: "universe-demo-atlas" } },
  ],
};

/** The bundled demo is one source selection, outside the reusable host. */
export function DemoUniverseHost() {
  const copy = useTranslations("universe");
  return <UniverseWorkspaceHost demoCatalog={mockCatalog} demoTour={tour} demoPresentation={{ regions: copy.demoRegions, factualReferences: true }} />;
}
