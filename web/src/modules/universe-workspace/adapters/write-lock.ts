/** A shared lock serializes the complete storage read/check/write across browser tabs. */
export type WorkspaceWriteLock = <Result>(name: string, signal: AbortSignal, operation: () => Result) => Promise<Result>;

/** Resolve browser capabilities only when a client explicitly requests a mutation. */
export const browserWorkspaceWriteLock: WorkspaceWriteLock = async (name, signal, operation) => {
  if (typeof navigator === "undefined" || !navigator.locks?.request) throw new Error("Workspace write locking unavailable");
  return navigator.locks.request(name, { mode: "exclusive", signal }, operation);
};
