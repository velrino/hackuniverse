import { getEntity } from "../domain/catalog";
import { buildCameraLinkUrl, isCameraPose, readCameraLink, type CameraLinkSource, type UniverseCameraPose, type UniverseCameraRestore } from "../domain/camera-link";
import type { NavigationTarget, UniverseCatalog } from "../domain/types";

export type CameraSnapshot = { target: NavigationTarget; pose: UniverseCameraPose };
export type CameraLocationState = Readonly<{
  ready: boolean;
  suppressAutoTour: boolean;
  navigationRequest?: { token: string; target: NavigationTarget };
  restore?: UniverseCameraRestore;
  status: "idle" | "invalid" | "unavailable" | "copied" | "copy-error";
  canShare: boolean;
  sharedUrl: string;
}>;
type Ports = {
  href(): string;
  replace(url: string): void;
  copy(text: string): Promise<void>;
  later(run: () => void, milliseconds: number): unknown;
  cancel(timer: unknown): void;
};
export const initialCameraLocation: CameraLocationState = Object.freeze({ ready: false, suppressAutoTour: false, status: "idle", canShare: false, sharedUrl: "" });

/** Owns URL intent; no scene, router, browser storage or provider data enters this controller. */
export function createCameraLocation(catalog: UniverseCatalog, source: CameraLinkSource | undefined, ports: Ports) {
  let state = initialCameraLocation;
  let sequence = 0;
  let mounted = false;
  let lastKey = "";
  let timer: unknown;
  let pending: CameraSnapshot | null = null;
  let reader: (() => CameraSnapshot | null) | null = null;
  let copyVersion = 0;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<CameraLocationState>) => {
    state = Object.freeze({ ...state, ...patch }); listeners.forEach((listener) => listener());
  };
  const clear = () => { if (timer !== undefined) ports.cancel(timer); timer = undefined; pending = null; };
  const key = () => {
    const url = new URL(ports.href());
    return JSON.stringify([url.searchParams.getAll("target"), url.searchParams.getAll("camera"), url.searchParams.getAll("source")]);
  };
  const known = (capture: CameraSnapshot | null): capture is CameraSnapshot => Boolean(capture && getEntity(catalog, capture.target) && isCameraPose(capture.pose));
  const write = (capture: CameraSnapshot) => {
    const url = buildCameraLinkUrl(ports.href(), capture.target.id, capture.pose, source);
    if (!url) return null;
    ports.replace(url); lastKey = key();
    return url;
  };
  function receive(force = false) {
    if (!mounted) return;
    const nextKey = key();
    if (!force && nextKey === lastKey) return;
    lastKey = nextKey; clear(); ++copyVersion;
    const link = readCameraLink(new URL(ports.href()).search);
    if (link.kind === "none") {
      publish({ ready: true, navigationRequest: undefined, restore: undefined, status: "idle", suppressAutoTour: state.suppressAutoTour }); return;
    }
    if (link.kind === "invalid") {
      publish({ ready: true, navigationRequest: undefined, restore: undefined, status: "invalid", suppressAutoTour: true }); return;
    }
    const entity = getEntity(catalog, link.targetId);
    if (!entity || link.source && link.source !== source) {
      publish({ ready: true, navigationRequest: undefined, restore: undefined, status: "unavailable", suppressAutoTour: true }); return;
    }
    const target = { kind: entity.kind, id: entity.id };
    const token = `camera-link:${++sequence}`;
    publish({ ready: true, suppressAutoTour: true, status: "idle", canShare: false, navigationRequest: { token, target }, restore: { token, target, pose: link.pose } });
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialCameraLocation,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    mount() { mounted = true; receive(true); },
    receive,
    update(next: UniverseCatalog, nextSource: CameraLinkSource | undefined) {
      const changedSource = source !== nextSource;
      catalog = next; source = nextSource;
      if (mounted && (state.restore || state.status === "unavailable" || changedSource)) receive(true);
    },
    attach(next: (() => CameraSnapshot | null) | null) {
      reader = next;
      publish({ canShare: !state.restore && known(reader?.() ?? null) });
    },
    restored(token: string, success: boolean) {
      if (!mounted || state.restore?.token !== token) return;
      publish({ restore: undefined, navigationRequest: undefined, status: success ? "idle" : "invalid", canShare: known(reader?.() ?? null) });
    },
    capture(capture: CameraSnapshot, reason: "manual" | "navigation") {
      if (!mounted || state.restore || !known(capture)) return;
      if ((state.status === "invalid" || state.status === "unavailable") && reason !== "manual" && capture.target.id === catalog.initialTarget.id) return;
      clear(); pending = capture;
      publish({ canShare: true });
      timer = ports.later(() => {
        timer = undefined;
        const capture = pending; pending = null;
        if (!mounted || !capture || state.restore) return;
        try { if (write(capture)) publish({ status: "idle" }); } catch { /* History can be restricted; the view remains usable. */ }
      }, 200);
    },
    async copy() {
      clear();
      const attempt = ++copyVersion;
      const capture = reader?.() ?? null;
      if (!mounted || state.restore || !known(capture)) { publish({ status: "unavailable" }); return; }
      try {
        const url = write(capture);
        if (!url) { publish({ status: "copy-error" }); return; }
        // Invoke Clipboard synchronously in the click; do not await scene work first.
        publish({ sharedUrl: url });
        const operation = ports.copy(url);
        await operation;
        if (mounted && attempt === copyVersion) publish({ status: "copied" });
      } catch { if (mounted && attempt === copyVersion) publish({ status: "copy-error" }); }
    },
    dispose() { mounted = false; ++copyVersion; clear(); reader = null; },
  };
}
