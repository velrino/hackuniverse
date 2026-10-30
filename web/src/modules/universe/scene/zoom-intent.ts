/** Coalesce a continuous wheel/pinch gesture; a reversal is a distinct intent. */
export function createZoomIntentGate(idleMs = 240) {
  let previous: { direction: "in" | "out"; at: number } | undefined;
  return (direction: "in" | "out", now: number): boolean => {
    if (!Number.isFinite(now)) return false;
    const continuous = previous && now >= previous.at && now - previous.at < idleMs;
    const accepted = !continuous || previous!.direction !== direction;
    previous = { direction, at: now };
    return accepted;
  };
}
