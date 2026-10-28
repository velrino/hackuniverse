import type { ComponentType, ReactNode } from "react";
import type { UniverseCatalog } from "../../domain/types";
import type { UniverseCopy } from "../../messages";
import type { UniverseSceneProps } from "../../scene/types";
import type { UniverseTourStep } from "../../hooks/use-universe-tour";

export type UniverseTourDefinition = { storageKey: string; steps: readonly UniverseTourStep[] };

export type UniverseAdapters = {
  catalog: UniverseCatalog;
  copy: UniverseCopy;
  tour?: UniverseTourDefinition;
  presentationReady?: boolean;
  autoTour?: boolean;
  formatNumber?: (value: number) => string;
  components: {
    Scene: ComponentType<UniverseSceneProps>;
    LanguagePicker: ComponentType;
    BrandLogo: ComponentType<{ size?: number; alt?: string; className?: string; eager?: boolean }>;
    DesignLink: ComponentType<{ children: ReactNode; className?: string }>;
  };
};
