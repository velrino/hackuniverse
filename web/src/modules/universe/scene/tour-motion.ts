export type TourDolly = {
  readonly duration: number;
  sample(elapsedMs: number): { distance: number; progress: number };
};

const LOG_SPEED_PER_MS = 0.9 / 1000;
const START_RAMP_MS = 350;
const END_RAMP_MS = 450;

/** Constant perceptual pullback speed; only the tour's endpoints ramp to rest. */
export function createTourDolly(
  fromDistance: number,
  toDistance: number,
  { start = false, end = false }: { start?: boolean; end?: boolean } = {},
): TourDolly | null {
  if (!Number.isFinite(fromDistance) || !Number.isFinite(toDistance) || fromDistance <= 0 || toDistance <= fromDistance) return null;

  const growth = (toDistance - fromDistance) / fromDistance;
  const span = Number.isFinite(growth) ? Math.log1p(growth) : Math.log(toDistance) - Math.log(fromDistance);
  if (!Number.isFinite(span) || span <= 0) return null;
  let accelerate = start ? START_RAMP_MS : 0;
  let decelerate = end ? END_RAMP_MS : 0;
  const rampArea = LOG_SPEED_PER_MS * (accelerate + decelerate) / 2;
  // Short stages still reach the shared boundary speed, with shorter ramps.
  if (rampArea > span) {
    const scale = span / rampArea;
    accelerate *= scale;
    decelerate *= scale;
  }
  const cruise = Math.max(0, span / LOG_SPEED_PER_MS - (accelerate + decelerate) / 2);
  const duration = accelerate + cruise + decelerate;
  const fromLog = Math.log(fromDistance);
  const accelerated = LOG_SPEED_PER_MS * accelerate / 2;

  return {
    duration,
    sample(elapsedMs) {
      const elapsed = Number.isFinite(elapsedMs)
        ? Math.min(duration, Math.max(0, elapsedMs))
        : elapsedMs === Infinity ? duration : 0;
      if (elapsed <= 0) return { distance: fromDistance, progress: 0 };
      if (elapsed >= duration) return { distance: toDistance, progress: 1 };

      let travel: number;
      if (accelerate > 0 && elapsed < accelerate) {
        travel = LOG_SPEED_PER_MS * elapsed * elapsed / (2 * accelerate);
      } else if (elapsed <= accelerate + cruise) {
        travel = accelerated + LOG_SPEED_PER_MS * (elapsed - accelerate);
      } else {
        const slowing = elapsed - accelerate - cruise;
        travel = accelerated + LOG_SPEED_PER_MS * cruise + LOG_SPEED_PER_MS * slowing
          - LOG_SPEED_PER_MS * slowing * slowing / (2 * decelerate);
      }
      return {
        distance: Math.min(toDistance, Math.max(fromDistance, Math.exp(fromLog + travel))),
        progress: elapsed / duration,
      };
    },
  };
}
