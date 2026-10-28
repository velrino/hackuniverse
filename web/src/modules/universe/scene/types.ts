import type { NavigationTarget, UniverseSceneView } from "../domain/types";
import type { ShipFlightInput } from "./flight";

export type UniverseFlightStatus = "idle" | "loading" | "ready" | "error";
export type UniverseTourCameraStep = { token: string; target: NavigationTarget };

export type UniverseSceneProps = {
  view: UniverseSceneView;
  selectedId: string | null;
  playing: boolean;
  showOrbits: boolean;
  autoOrbit?: boolean;
  resetToken: number;
  zoomAction: { direction: "in" | "out"; token: number } | null;
  ariaLabel: string;
  flightEnabled?: boolean;
  flightPaused?: boolean;
  flightInput?: ShipFlightInput;
  onFlightStatus?: (status: UniverseFlightStatus) => void;
  flightTargetId?: string | null;
  guideActionLabel?: string;
  onGuideRequest?: (id: string) => void;
  autopilotTargetId?: string | null;
  onAutopilotEnd?: () => void;
  hasParentView?: boolean;
  onScaleOut?: () => void;
  onScaleIn?: (id: string) => void;
  tourStep?: UniverseTourCameraStep | null;
  onTourArrive?: (token: string) => void;
  onInteraction?: () => void;
  onSelect: (id: string) => void;
  onReady: () => void;
  onUnavailable: () => void;
};
