/** Renew feedback only when this manual input changed the optical distance. */
export function isManualZoomSample(before: number, after: number, manual: boolean): boolean {
  return manual && Number.isFinite(before) && Number.isFinite(after) && before > 0 && after > 0 &&
    Math.abs(after - before) > Math.max(before, after) * 1e-10;
}
