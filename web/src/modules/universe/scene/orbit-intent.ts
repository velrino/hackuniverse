type OrbitInput = { now: number; azimuth: number; polar: number; manual: boolean; inputRecent?: boolean };

/** Real angular travel only; no timers or queued cues outlive the user's drag. */
export function createOrbitIntentGate(repeatMs = 2250, minimumTravel = 0.001) {
  let previous: OrbitInput | undefined;
  let travel = 0;
  let lastCue = -Infinity;
  return (input: OrbitInput) => {
    if (![input.now, input.azimuth, input.polar].every(Number.isFinite) || input.now < 0) {
      previous = undefined; travel = 0; lastCue = -Infinity; return false;
    }
    const before = previous;
    previous = input;
    if (!input.manual || !before || input.now < before.now) {
      travel = 0; lastCue = -Infinity; return false;
    }
    // Damping may continue while a held pointer is stationary. Keep the drag's
    // cadence, but discard that inertia instead of treating it as fresh input.
    if (input.inputRecent === false) { travel = 0; return false; }
    const azimuthDelta = Math.atan2(Math.sin(input.azimuth - before.azimuth), Math.cos(input.azimuth - before.azimuth));
    const delta = Math.hypot(azimuthDelta, input.polar - before.polar);
    if (delta <= 1e-8) return false;
    travel += delta;
    if (travel < minimumTravel || input.now - lastCue < repeatMs) return false;
    travel = 0; lastCue = input.now;
    return true;
  };
}
