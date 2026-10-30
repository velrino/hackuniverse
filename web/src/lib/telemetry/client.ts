import "posthog-js/dist/exception-autocapture";
import posthog from "posthog-js/no-external";
import { droppedCustomPropertyNames, eventContext, isCustomEventName, readTelemetryConfiguration, sanitizeTelemetryEvent, sanitizeText, sanitizeUrl, type TelemetryEventName } from "./shared";

type ClientState = {
  initialized: boolean;
  starting: boolean;
  reported: WeakSet<object>;
  consoleObserved?: boolean;
  stringErrors?: Map<string, number>;
  warnedProperties?: Set<string>;
  /** Only the last accepted native pageview key, with camera/search content removed. */
  lastPageviewUrl?: string;
  /** An earlier development module may still own an exception-mirroring listener. */
  unsubscribe?: () => void;
};
const stateKey = Symbol.for("hackuniverse.telemetry.client");
const consoleCooldownMs = 10_000;
const diagnosticKeyLimit = 100;

// Keep one SDK/console observer and dedup set across module replacement and routes.
function clientState(): ClientState {
  const root = globalThis as typeof globalThis & { [key: symbol]: ClientState | undefined };
  return root[stateKey] ??= { initialized: false, starting: false, reported: new WeakSet() };
}

function consoleMessage(args: readonly unknown[]) {
  let message = "";
  for (const value of args) {
    if (typeof value !== "string") continue;
    const separator = message ? " " : "";
    const remaining = 4096 - message.length - separator.length;
    if (remaining <= 0) break;
    message += separator + value.slice(0, remaining);
  }
  return sanitizeText(message || "Console error");
}

function shouldReportString(state: ClientState, message: string) {
  const recent = state.stringErrors ??= new Map();
  const now = Date.now();
  const last = recent.get(message);
  if (last !== undefined && now >= last && now - last < consoleCooldownMs) return false;
  recent.delete(message);
  if (recent.size >= diagnosticKeyLimit) recent.delete(recent.keys().next().value!);
  recent.set(message, now);
  return true;
}

function observeConsole(state: ClientState) {
  if (state.consoleObserved) return;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const diagnostic = typeof args[0] === "string" && (args[0].startsWith("[PostHog.js]") || args[0] === "rrweb logger error:");
      if (!diagnostic) {
        const error = args.find((value) => value instanceof Error);
        if (error) captureClientException(error, { source: "console" });
        else {
          const message = consoleMessage(args);
          if (shouldReportString(state, message)) captureClientException(new Error(message), { source: "console" });
        }
      }
    } catch { /* Preserve the original console even if observation fails. */ }
    original.apply(console, args);
  };
  state.consoleObserved = true;
}

export function initializeClientTelemetry(): boolean {
  if (typeof window === "undefined") return false;
  const state = clientState();
  // Stop a legacy mirror when this module replaces an older one during development.
  const unsubscribe = state.unsubscribe;
  delete state.unsubscribe;
  try { unsubscribe?.(); } catch { /* Optional cleanup. */ }
  if (state.initialized) return true;
  if (state.starting) return false;
  const config = readTelemetryConfiguration({
    token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    enabled: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
  });
  if (!config) return false;
  state.starting = true;
  try {
    posthog.init(config.token, {
      api_host: config.host,
      defaults: "2026-08-30",
      persistence: "localStorage",
      persistence_name: "hackuniverse",
      person_profiles: "never",
      autocapture: false,
      // The SDK owns initial/history/query capture; transport ignores camera-only changes.
      capture_pageview: { path: true, search: true, hash: false },
      capture_pageleave: false,
      // Console uses the same object-identity dedup as explicit React boundaries.
      capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false },
      disable_session_recording: true,
      disable_surveys: true,
      disable_conversations: true,
      disable_product_tours: true,
      disable_web_experiments: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      capture_dead_clicks: false,
      capture_heatmaps: false,
      capture_performance: false,
      save_campaign_params: false,
      save_referrer: false,
      mask_all_element_attributes: true,
      mask_all_text: true,
      get_current_url: (url) => sanitizeUrl(url),
      before_send(event) {
        if (!event) return null;
        if (!["$pageview", "$exception"].includes(event.event) && !isCustomEventName(event.event)) return null;
        try {
          const sanitized = sanitizeTelemetryEvent<typeof event>({
            ...event,
            properties: {
              ...event.properties,
              ...eventContext("browser"),
              source: event.properties.source ?? (event.event === "$exception" ? "browser-automatic" : "navigation"),
              ...(event.event === "$exception" ? { exception_id: event.properties.exception_id ?? event.uuid } : {}),
            },
          });
          if (sanitized.event === "$pageview") {
            const url = sanitized.properties.$current_url;
            if (typeof url === "string" && /^https?:\/\//u.test(url)) {
              if (state.lastPageviewUrl === url) return null;
              state.lastPageviewUrl = url;
            } else delete state.lastPageviewUrl;
          }
          return sanitized;
        } catch { return null; }
      },
    });
    state.initialized = true;
    try { observeConsole(state); } catch { /* A locked console must not block analytics. */ }
    return true;
  } catch {
    return false;
  } finally { state.starting = false; }
}

/** Use code-owned context; never pass imported content, input values or request bodies. */
export function captureEvent(name: TelemetryEventName, properties: Record<string, unknown> = {}): void {
  if (!isCustomEventName(name) || !initializeClientTelemetry()) return;
  if (process.env.NODE_ENV === "development") {
    try {
      const warned = clientState().warnedProperties ??= new Set();
      const safeName = sanitizeText(name).slice(0, 128);
      const unknown = droppedCustomPropertyNames(properties).map((key) => sanitizeText(key).slice(0, 128)).filter((key) => {
        const signature = JSON.stringify([safeName, key]);
        if (warned.has(signature) || warned.size >= diagnosticKeyLimit) return false;
        warned.add(signature);
        return true;
      });
      if (unknown.length) console.warn("[HackUniverse telemetry] Dropped custom property names:", safeName, unknown);
    } catch { /* Developer feedback must not prevent event capture. */ }
  }
  try { posthog.capture(name, properties); } catch { /* Optional telemetry. */ }
}

export function captureClientException(error: unknown, context: Record<string, unknown> = {}): void {
  if (error instanceof Error && error.name === "AbortError") return;
  if (!initializeClientTelemetry()) return;
  const state = clientState();
  if (error && typeof error === "object" && state.reported.has(error)) return;
  try {
    const captured = posthog.captureException(error, context);
    if (captured && error && typeof error === "object") state.reported.add(error);
  } catch { /* Diagnostics failures must preserve normal recovery behavior. */ }
}
