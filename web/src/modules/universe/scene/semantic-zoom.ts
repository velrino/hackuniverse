export type SemanticZoomDecision = { type: "out" } | { type: "in"; id: string };

export type SemanticZoomInput = {
  /** Monotonic milliseconds, using the same clock for this gate's lifetime. */
  now: number;
  viewKey: string;
  mode: "system" | "cluster" | "planet";
  selected: boolean;
  distance: number;
  overviewDistance: number;
  focusDistance?: number;
  /** Only a recent user wheel or pinch supplies direction. */
  zoomDirection: "in" | "out" | null;
  /** The host supplies a visible group, never a website planet or visual star. */
  nearestGroup?: { id: string; screenDistance: number };
  hasParent: boolean;
  /** Camera tweens, flight, travel and suspended interaction block transitions. */
  moving: boolean;
};

const COOLDOWN_MS = 900;
const positive = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Pure hierarchy-transition policy; it never moves a camera or changes a catalog. */
export function createSemanticZoomGate() {
  let contextKey: string | null = null;
  let contextSelected = false;
  let outArmed = true;
  let inArmed = true;
  let lastTransition = -Infinity;

  function reset() {
    contextKey = null;
    outArmed = true;
    inArmed = true;
    // Keep the global cooldown across view changes and explicit host resets.
  }

  return {
    reset,
    evaluate(input: SemanticZoomInput): SemanticZoomDecision | null {
      if (contextKey !== input.viewKey || contextSelected !== input.selected) {
        contextKey = input.viewKey;
        contextSelected = input.selected;
        outArmed = true;
        inArmed = true;
      }
      if (!Number.isFinite(input.now) || input.now < 0 || !Number.isFinite(input.distance) ||
        input.distance < 0 || !positive(input.overviewDistance)) return null;

      const outBaseline = input.selected ? input.focusDistance : input.overviewDistance;
      const outThreshold = positive(outBaseline) ? outBaseline * (input.selected ? 2 : 1.5) : Infinity;
      // A wider return band prevents repeated transitions at one threshold.
      if (input.distance <= outThreshold * 0.8) outArmed = true;
      if (input.distance >= input.overviewDistance * 0.65) inArmed = true;

      if (input.moving || !input.zoomDirection || input.now - lastTransition < COOLDOWN_MS) return null;

      if (input.zoomDirection === "out" && input.hasParent && outArmed && input.distance > outThreshold) {
        outArmed = false;
        lastTransition = input.now;
        return { type: "out" };
      }

      const group = input.nearestGroup;
      if (input.zoomDirection === "in" && input.mode === "cluster" && !input.selected && inArmed &&
        input.distance < input.overviewDistance * 0.5 && group && group.id.trim().length > 0 &&
        Number.isFinite(group.screenDistance) && group.screenDistance >= 0 && group.screenDistance < 0.3) {
        inArmed = false;
        lastTransition = input.now;
        return { type: "in", id: group.id };
      }
      return null;
    },
  };
}
