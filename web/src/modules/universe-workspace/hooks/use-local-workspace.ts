"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { createLocalWorkspaceStore, workspaceStorageKey } from "../adapters";
import { selectWorkspaceUniverse, type LocalWorkspace } from "../domain";

// Browser APIs are resolved only after mount or an explicit user mutation.
// Every consumer in this document observes the same workspace instance.
const store = createLocalWorkspaceStore(() => window.localStorage);
let consumers = 0;

function storageChanged(event: StorageEvent) {
  if (event.key === workspaceStorageKey || event.key === null) store.reload(true);
}
function focusChanged() { store.reload(true); }

export function useLocalWorkspace() {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  useEffect(() => {
    if (consumers++ === 0) {
      store.reload();
      window.addEventListener("storage", storageChanged);
      window.addEventListener("focus", focusChanged);
    }
    return () => {
      if (--consumers === 0) {
        window.removeEventListener("storage", storageChanged);
        window.removeEventListener("focus", focusChanged);
      }
    };
  }, []);
  // Bind the baseline to the render that produced the next workspace. A stale
  // callback cannot accidentally use a newer snapshot from a mutable ref.
  const commit = useCallback(async (next: LocalWorkspace): Promise<boolean> => store.commit(next, state.snapshot), [state.snapshot]);
  const selectUniverse = useCallback(async (id: string): Promise<boolean> => commit(selectWorkspaceUniverse(state.workspace, id)), [commit, state.workspace]);
  const retry = useCallback(() => store.reload(), []);
  return { workspace: state.workspace, ready: state.ready, error: state.error, commit, selectUniverse, retry };
}
