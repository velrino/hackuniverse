type Direction = "in" | "out";
type Sample = {
  active: boolean;
  beforeDistance: number;
  afterDistance: number;
  cameraTravelSquared: number;
  targetTravelSquared: number;
};

/** Tour-owned movement only; a held planet's orbital motion never enters this sampler. */
export function createTourZoomFeedback(intent: (direction: Direction) => void, ended: () => void) {
  let sounding = false;
  let direction: Direction = "out";
  const stop = () => {
    if (!sounding) return;
    sounding = false;
    ended();
  };
  return {
    stop,
    sample({ active, beforeDistance, afterDistance, cameraTravelSquared, targetTravelSquared }: Sample) {
      if (!active || !Number.isFinite(beforeDistance) || !Number.isFinite(afterDistance) ||
        !Number.isFinite(cameraTravelSquared) || !Number.isFinite(targetTravelSquared) ||
        beforeDistance <= 0 || afterDistance <= 0 || cameraTravelSquared < 0 || targetTravelSquared < 0) { stop(); return; }
      const epsilon = Math.max(1, beforeDistance, afterDistance) * 1e-9;
      const difference = afterDistance - beforeDistance;
      if (Math.abs(difference) > epsilon) direction = difference > 0 ? "out" : "in";
      else if (Math.max(cameraTravelSquared, targetTravelSquared) <= epsilon * epsilon) { stop(); return; }
      // Lateral approach segments retain their last direction without flipping each frame.
      sounding = true;
      intent(direction);
    },
  };
}
