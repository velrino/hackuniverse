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
  /** Distance from the gesture focal point to a visible group's projected bounds. */
  nearestGroup?: { id: string; screenDistance: number };
  hasParent: boolean;
  /** Camera tweens, flight, travel and suspended interaction block transitions. */
  moving: boolean;
};

const COOLDOWN_MS = 900;
const PENDING_MS = 1600;
const positive = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

/** Pure hierarchy-transition policy; it never moves a camera or changes a catalog. */
export function createSemanticZoomGate() {
  let contextKey: string | null = null;
  let contextSelected = false;
  let outArmed = true;
  let inArmed = true;
  let lastTransition = -Infinity;
  let pending: { decision: SemanticZoomDecision; direction: "in" | "out"; expires: number } | null = null;

  function reset() {
    contextKey = null;
    outArmed = true;
    inArmed = true;
    pending = null;
    // Keep the global cooldown across view changes and explicit host resets.
  }

  return {
    reset,
    cancelPending() { pending = null; },
    hasPending() { return pending !== null; },
    evaluate(input: SemanticZoomInput): SemanticZoomDecision | null {
      if (contextKey !== input.viewKey || contextSelected !== input.selected) {
        contextKey = input.viewKey;
        contextSelected = input.selected;
        outArmed = true;
        inArmed = true;
        pending = null;
      }
      if (!Number.isFinite(input.now) || input.now < 0 || !Number.isFinite(input.distance) ||
        input.distance < 0 || !positive(input.overviewDistance)) { pending = null; return null; }

      const outBaseline = input.selected ? input.focusDistance : input.overviewDistance;
      const outThreshold = positive(outBaseline) ? outBaseline * (input.selected ? 2 : 1.5) : Infinity;
      // A wider return band prevents repeated transitions at one threshold.
      if (input.distance <= outThreshold * 0.8) outArmed = true;
      if (input.distance >= input.overviewDistance * 0.65) inArmed = true;

      const group = input.nearestGroup;
      const canOut = input.hasParent && outArmed && input.distance > outThreshold;
      const canIn = input.mode === "cluster" && !input.selected && inArmed &&
        input.distance < input.overviewDistance * 0.5 && group && group.id.trim().length > 0 &&
        Number.isFinite(group.screenDistance) && group.screenDistance >= 0 && group.screenDistance < 0.3;
      if (input.zoomDirection) {
        // Only a fresh explicit gesture can create or replace a pending crossing.
        const decision: SemanticZoomDecision | null = input.zoomDirection === "out" && canOut ? { type: "out" }
          : input.zoomDirection === "in" && canIn ? { type: "in", id: group!.id } : null;
        pending = decision ? { decision, direction: input.zoomDirection, expires: input.now + PENDING_MS } : null;
      }
      if (!pending) return null;
      const valid = pending.decision.type === "out" ? canOut : canIn && group?.id === pending.decision.id;
      if (!valid || input.now > pending.expires) { pending = null; return null; }
      // A validated crossing survives a short animation/cooldown after input ends.
      if (input.moving || input.now - lastTransition < COOLDOWN_MS) return null;
      const decision = pending.decision;
      pending = null;
      if (decision.type === "out") outArmed = false;
      else inArmed = false;
      lastTransition = input.now;
      return decision;
    },
  };
}
