"use client";

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { browserStorage } from "@/lib/storage";
import { bodyScaleFromQuery, bodyScaleStorageKey, defaultBodyScale, isBodyScaleMode, type BodyScaleMode } from "../domain/body-scale";

const listeners = new Set<() => void>();
let memory = defaultBodyScale;
let storageFailed = false;
function read(): BodyScaleMode {
  if (storageFailed) return memory;
  try { const saved = browserStorage.getItem(bodyScaleStorageKey); return isBodyScaleMode(saved) ? saved : defaultBodyScale; }
  catch { return memory; }
}
function save(mode: BodyScaleMode) {
  memory = mode;
  try { browserStorage.setItem(bodyScaleStorageKey, mode); storageFailed = false; }
  catch { storageFailed = true; }
  listeners.forEach((listener) => listener());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => { if (event.key === bodyScaleStorageKey || event.key === null) { storageFailed = false; listener(); } };
  window.addEventListener("storage", changed);
  return () => { listeners.delete(listener); window.removeEventListener("storage", changed); };
}
export function useBodyScale() {
  const search = useSearchParams();
  const query = bodyScaleFromQuery(search?.getAll("scale") ?? []);
  const saved = useSyncExternalStore(subscribe, read, () => defaultBodyScale);
  useEffect(() => { if (query !== null) save(query); }, [query]);
  const onChange = useCallback((mode: BodyScaleMode) => {
    save(mode);
    const url = new URL(window.location.href);
    url.searchParams.set("scale", mode);
    const state = { ...(window.history.state ?? {}) };
    delete state.__NA; delete state._N; delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
    window.history.replaceState(state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);
  const mode = query ?? saved;
  return useMemo(() => ({ mode, onChange }), [mode, onChange]);
}
