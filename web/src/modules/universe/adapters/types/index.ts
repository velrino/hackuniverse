import type { ComponentType, ReactNode } from "react";
import type { NavigationTarget, UniverseCatalog } from "../../domain/types";
import type { UniverseCopy } from "../../messages";
import type { UniverseEntityTransition, UniverseSceneProps } from "../../scene/types";
import type { UniverseTourStep } from "../../hooks/use-universe-tour";

export type UniverseTourDefinition = { storageKey: string; steps: readonly UniverseTourStep[] };

export type UniverseActionContext = { target: NavigationTarget; onInteraction: () => void; disabled?: boolean };
/** Optional interaction feedback supplied by the host; no audio provider enters the scene. */
export type UniverseAudio = {
  tourRequiresInteraction?: boolean;
  onTourStart?: () => void;
  onTourZoomIntent?: (direction: "in" | "out") => void;
  onTourZoomEnd?: () => void;
  onZoomIntent?: (direction: "in" | "out") => void;
  onOrbitIntent?: () => void;
  onCameraGestureEnd?: (motion: "zoom" | "orbit") => void;
  onDestinationHover?: (id: string) => void;
  onMenuOpenChange?: (open: boolean) => void;
  Controls?: ComponentType;
};
export type UniverseLocation = {
  navigationRequest?: { token: string; target: NavigationTarget };
  Controls: ComponentType;
  Status?: ComponentType;
};
/** Optional host-owned editing tools; the explorer never knows their persistence/provider. */
export type UniverseManagement = {
  blocked: boolean;
  navigationRequest?: { token: string; target: NavigationTarget };
  entityTransition?: UniverseEntityTransition | null;
  onEntityTransitionEnd?: (token: string) => void;
  Actions: ComponentType<UniverseActionContext>;
  SelectionActions: ComponentType<UniverseActionContext>;
  EmptyState?: ComponentType<UniverseActionContext>;
  Controls: ComponentType<{ target: NavigationTarget; onRequestClose: () => void }>;
};

export type UniverseAdapters = {
  catalog: UniverseCatalog;
  copy: UniverseCopy;
  tour?: UniverseTourDefinition;
  presentationReady?: boolean;
  autoTour?: boolean;
  management?: UniverseManagement;
  audio?: UniverseAudio;
  location?: UniverseLocation;
  formatNumber?: (value: number) => string;
  components: {
    Scene: ComponentType<UniverseSceneProps>;
    LanguagePicker: ComponentType;
    BrandLogo: ComponentType<{ size?: number; alt?: string; className?: string; eager?: boolean }>;
    DesignLink: ComponentType<{ children: ReactNode; className?: string }>;
  };
};
