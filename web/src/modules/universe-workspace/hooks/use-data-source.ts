"use client";

import { useSyncExternalStore } from "react";
import { browserStorage } from "../../../lib/storage";

export type UniverseDataSource = "demo" | "local";
const key = "hackuniverse.data-source.v1";
const listeners = new Set<() => void>();
let memory: UniverseDataSource = "demo";
let memoryOverride: UniverseDataSource | null = null;
const notify = () => listeners.forEach((listener) => listener());
function read(): UniverseDataSource {
  if (memoryOverride) return memoryOverride;
  try { const value = browserStorage.getItem(key); return value === "local" ? "local" : value === "demo" ? "demo" : memory; }
  catch { return memory; }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) { memoryOverride = null; listener(); } };
  window.addEventListener("storage", changed);
  return () => { listeners.delete(listener); window.removeEventListener("storage", changed); };
}
function setSource(next: UniverseDataSource) {
  memory = next;
  try { browserStorage.setItem(key, next); memoryOverride = null; }
  catch { memoryOverride = next; }
  notify();
}
export function useDataSource() {
  const source = useSyncExternalStore(subscribe, read, () => "demo" as const);
  return { source, setSource };
}
