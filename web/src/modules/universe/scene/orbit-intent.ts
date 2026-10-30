type OrbitAngles = { azimuth: number; polar: number };
type OrbitSample = { before: OrbitAngles; after: OrbitAngles; manual: boolean; inputMoved: boolean };

/** Compare one physical pointer event, never angular travel accumulated by animation frames. */
export function isManualOrbitSample({ before, after, manual, inputMoved }: OrbitSample): boolean {
  if (!manual || !inputMoved || ![before.azimuth, before.polar, after.azimuth, after.polar].every(Number.isFinite)) return false;
  const azimuth = Math.atan2(Math.sin(after.azimuth - before.azimuth), Math.cos(after.azimuth - before.azimuth));
  return Math.hypot(azimuth, after.polar - before.polar) > 1e-8;
}
