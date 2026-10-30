/** Event-driven heartbeat: no input means no cue or delayed work after a gesture. */
export function createZoomIntentGate(idleMs = 240, heartbeatMs = 500, minimumGapMs = 100) {
  let previousInput: number | undefined;
  let accepted: { direction: "in" | "out"; at: number } | undefined;
  return (direction: "in" | "out", now: number): boolean => {
    if (!Number.isFinite(now)) return false;
    if (previousInput !== undefined && now < previousInput) accepted = undefined;
    const continuous = previousInput !== undefined && now >= previousInput && now - previousInput < idleMs;
    previousInput = now;
    if (accepted && now - accepted.at < minimumGapMs) return false;
    if (accepted && continuous && accepted.direction === direction && now - accepted.at < heartbeatMs) return false;
    accepted = { direction, at: now };
    return true;
  };
}
