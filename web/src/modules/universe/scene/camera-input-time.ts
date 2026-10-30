/** Native packets can remain trusted after queuing behind a busy render thread. */
export function isFreshCameraInput(timeStamp: number, now: number): boolean {
  if (!Number.isFinite(timeStamp) || !Number.isFinite(now) || timeStamp < 0 || now < 0) return false;
  const age = now - timeStamp;
  return age >= 0 && age <= 180;
}
