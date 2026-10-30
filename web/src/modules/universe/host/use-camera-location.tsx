"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/i18n";
import type { CameraLinkSource } from "../domain/camera-link";
import type { UniverseCatalog } from "../domain/types";
import { createCameraLocation, type CameraLocationState } from "./camera-location";

type CameraLocation = ReturnType<typeof createCameraLocation>;
export const CameraLocationContext = createContext<{ controller: CameraLocation; state: CameraLocationState; source?: CameraLinkSource } | null>(null);
export const useCameraLocationContext = () => useContext(CameraLocationContext);

export function useCameraLocation(catalog: UniverseCatalog, source?: CameraLinkSource) {
  const [controller] = useState(() => createCameraLocation(catalog, source, {
    href: () => window.location.href,
    replace: (href) => {
      const state = { ...(window.history.state ?? {}) };
      delete state.__NA; delete state._N; delete state.__PRIVATE_NEXTJS_INTERNALS_TREE;
      const url = new URL(href);
      window.history.replaceState(state, "", `${url.pathname}${url.search}${url.hash}`);
    },
    copy: (text) => navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("Clipboard unavailable")),
    later: (run, delay) => window.setTimeout(run, delay),
    cancel: (timer) => window.clearTimeout(timer as number),
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => { controller.update(catalog, source); }, [catalog, source, controller]);
  useEffect(() => {
    controller.mount();
    const receive = () => controller.receive();
    window.addEventListener("popstate", receive);
    return () => { window.removeEventListener("popstate", receive); controller.dispose(); };
  }, [controller]);
  return { controller, state };
}

/** Stable host component; clipboard access begins in the user's original click. */
export function CameraShareControls() {
  const location = useCameraLocationContext();
  const copy = useTranslations("universe").cameraLink;
  if (!location) return null;
  const { state, controller } = location;
  const status = state.status === "copied" ? copy.copied : state.status === "copy-error" ? copy.failed : state.status === "invalid" ? copy.invalid : state.status === "unavailable" ? copy.unavailable : "";
  const local = location.source === "local";
  return <fieldset className="universe-menu-group"><legend>{copy.title}</legend>
    <Button type="button" variant="outline" disabled={!state.canShare || Boolean(state.restore)} onClick={() => { void controller.copy(); }}><Link2 aria-hidden="true" />{copy.action}</Button>
    <p>{local ? copy.local : copy.hint}</p>
    {status && <p role="status">{status}</p>}
    {state.status === "copy-error" && state.sharedUrl && <Input aria-label={copy.field} value={state.sharedUrl} readOnly onFocus={(event) => event.currentTarget.select()} />}
  </fieldset>;
}

export function CameraLinkStatus() {
  const location = useCameraLocationContext();
  const copy = useTranslations("universe").cameraLink;
  const status = location?.state.status;
  if (status !== "invalid" && status !== "unavailable") return null;
  return <p className="universe-camera-notice" role="status">{copy[status]}</p>;
}
