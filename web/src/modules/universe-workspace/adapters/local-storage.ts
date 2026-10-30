import { emptyLocalWorkspace, parseLocalWorkspace, TransferValidationError, validateWorkspaceJson, workspaceDocument, workspaceLimits, WorkspaceValidationError, type LocalWorkspace } from "../domain";
import { browserWorkspaceWriteLock, type WorkspaceWriteLock } from "./write-lock";

export const workspaceStorageKey = "hackuniverse.workspace.v1";
export const workspaceLockTimeoutMs = 2000;
export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem">;
export type WorkspaceStorageError = "unavailable" | "corrupt" | "conflict";
export type WorkspaceReadResult =
  | { ok: true; workspace: LocalWorkspace; snapshot: string | null }
  | { ok: false; error: WorkspaceStorageError };

function withinSizeLimit(value: string): boolean {
  return value.length <= workspaceLimits.bytes && new TextEncoder().encode(value).length <= workspaceLimits.bytes;
}

export function readWorkspaceSnapshot(storage: WorkspaceStorage): WorkspaceReadResult {
  let snapshot: string | null;
  try { snapshot = storage.getItem(workspaceStorageKey); }
  catch { return { ok: false, error: "unavailable" }; }
  if (snapshot === null) return { ok: true, workspace: emptyLocalWorkspace(), snapshot };
  if (!withinSizeLimit(snapshot)) return { ok: false, error: "corrupt" };
  try { return { ok: true, workspace: parseLocalWorkspace(JSON.parse(snapshot)), snapshot }; }
  catch { return { ok: false, error: "corrupt" }; }
}

export function serializeLocalWorkspace(workspace: LocalWorkspace): string {
  try {
    // New writes must remain exportable; legacy reads keep their existing policy.
    const canonical = validateWorkspaceJson(workspaceDocument(parseLocalWorkspace(workspace)));
    const snapshot = JSON.stringify(workspaceDocument(canonical));
    if (!withinSizeLimit(snapshot)) throw new WorkspaceValidationError("limit");
    return snapshot;
  } catch (error) {
    if (error instanceof TransferValidationError) {
      throw new WorkspaceValidationError(["limit", "size", "depth"].includes(error.code) ? "limit" : "invalid");
    }
    throw error;
  }
}

/** The caller must hold the workspace write lock while comparing and writing. */
export function saveWorkspaceSnapshot(storage: WorkspaceStorage, expected: string | null, workspace: LocalWorkspace): WorkspaceReadResult {
  const snapshot = serializeLocalWorkspace(workspace);
  const current = readWorkspaceSnapshot(storage);
  if (!current.ok) return current;
  if (current.snapshot !== expected) return { ok: false, error: "conflict" };
  try {
    storage.setItem(workspaceStorageKey, snapshot);
    // Another context can run between browser storage operations. Detect an
    // immediate competing write, without retrying or overwriting it again.
    if (storage.getItem(workspaceStorageKey) !== snapshot) return { ok: false, error: "conflict" };
  } catch { return { ok: false, error: "unavailable" }; }
  return { ok: true, workspace: parseLocalWorkspace(workspace), snapshot };
}

export type WorkspaceStoreSnapshot = Readonly<{
  workspace: LocalWorkspace;
  ready: boolean;
  error: WorkspaceStorageError | null;
  snapshot: string | null;
}>;

const initialSnapshot: WorkspaceStoreSnapshot = Object.freeze({ workspace: emptyLocalWorkspace(), ready: false, error: null, snapshot: null });

/** A browser-independent external store; opening it performs no reads or writes. */
export function createLocalWorkspaceStore(resolveStorage: () => WorkspaceStorage, writeLock: WorkspaceWriteLock = browserWorkspaceWriteLock) {
  let state = initialSnapshot;
  const listeners = new Set<() => void>();
  const publish = (next: WorkspaceStoreSnapshot) => {
    state = Object.freeze(next);
    for (const listener of listeners) listener();
  };
  const read = (): WorkspaceReadResult => {
    try { return readWorkspaceSnapshot(resolveStorage()); }
    catch { return { ok: false, error: "unavailable" }; }
  };
  const reload = (external = false) => {
    const result = read();
    if (!result.ok) { publish({ ...state, ready: true, error: result.error }); return; }
    if (external && state.ready && state.snapshot === result.snapshot) return;
    publish({ ...result, ready: true, error: external && state.ready ? "conflict" : null });
  };
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialSnapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    reload,
    async commit(workspace: LocalWorkspace, expected: string | null): Promise<boolean> {
      if (!state.ready || state.error === "corrupt" || state.error === "unavailable") return false;
      if (state.snapshot !== expected) { publish({ ...state, error: "conflict" }); return false; }
      const controller = new AbortController();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          writeLock(workspaceStorageKey, controller.signal, () => {
            // A timed-out/aborted waiter must never perform a delayed write.
            if (controller.signal.aborted) return false;
            if (!state.ready || state.error === "corrupt" || state.error === "unavailable") return false;
            if (state.snapshot !== expected) { publish({ ...state, error: "conflict" }); return false; }
            const result = saveWorkspaceSnapshot(resolveStorage(), expected, workspace);
            if (!result.ok) {
              if (result.error === "conflict") {
                const latest = read();
                publish(latest.ok ? { ...latest, ready: true, error: "conflict" } : { ...state, error: latest.error });
              } else publish({ ...state, error: result.error });
              return false;
            }
            // Publish before releasing the lock so another local caller cannot
            // observe an old baseline after this write has already succeeded.
            publish({ ...result, ready: true, error: null });
            return true;
          }),
          new Promise<boolean>((resolve) => {
            timeout = setTimeout(() => {
              controller.abort();
              publish({ ...state, error: "unavailable" });
              resolve(false);
            }, workspaceLockTimeoutMs);
          }),
        ]);
      } catch (error) {
        if (error instanceof WorkspaceValidationError) throw error;
        publish({ ...state, error: "unavailable" });
        return false;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
        controller.abort();
      }
    },
  };
}
