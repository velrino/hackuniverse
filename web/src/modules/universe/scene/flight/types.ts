import type { PerspectiveCamera, Scene, Vector3 } from "three";

export type ShipFlightInput = {
  throttle: number;
  turn: number;
  lift: number;
  boost: boolean;
};

export type ShipObstacle = { position: Vector3; radius: number };
export type ShipAutopilotEnd = "arrived" | "manual" | "cancelled" | "unavailable";

export type ShipPilotOptions = {
  scene: Scene;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  getSystemRadius: () => number;
  getObstacles: () => readonly ShipObstacle[];
  getSpawnAnchor?: () => Vector3;
  reducedMotion?: () => boolean;
  onExit?: () => void;
  onAutopilotEnd?: (reason: ShipAutopilotEnd) => void;
};

export type ShipPilot = {
  /** Owns the camera immediately; false means the request was cancelled. */
  enter: (options?: { anchor?: Vector3 }) => Promise<boolean>;
  /** The scene host restores its own map camera, target and framing. */
  exit: () => void;
  update: (delta: number) => void;
  setInput: (input: ShipFlightInput) => void;
  setAutopilotTarget: (getTarget: (() => ShipObstacle | undefined) | null) => void;
  setPaused: (paused: boolean) => void;
  isActive: () => boolean;
  dispose: () => void;
};
