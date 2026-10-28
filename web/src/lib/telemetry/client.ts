import "posthog-js/dist/exception-autocapture";
import posthog, { type CaptureResult } from "posthog-js/no-external";
import { companionEvent, eventContext, readTelemetryConfiguration, sanitizeTelemetryEvent, sanitizeUrl, type TelemetryEventName } from "./shared";

type ClientState = { initialized: boolean; starting: boolean; reported: WeakSet<object>; unsubscribe?: () => void; consoleObserved?: boolean };
const stateKey = Symbol.for("hackuniverse.telemetry.client");

// Keep one SDK/listener and dedup set across development module replacement as well as routes.
function clientState(): ClientState {
  const root = globalThis as typeof globalThis & { [key: symbol]: ClientState | undefined };
  return root[stateKey] ??= { initialized: false, starting: false, reported: new WeakSet() };
}

function onCaptured(event: CaptureResult) {
  try {
    const companion = companionEvent(event);
    if (companion) posthog.capture(companion.event, companion.properties);
  } catch { /* A companion event must never interrupt its native event. */ }
}

function observeConsole(state: ClientState) {
  if (state.consoleObserved) return;
  const original = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const diagnostic = typeof args[0] === "string" && (args[0].startsWith("[PostHog.js]") || args[0] === "rrweb logger error:");
      if (!diagnostic) {
        const error = args.find((value) => value instanceof Error)
          ?? new Error(args.filter((value) => typeof value === "string").join(" ").slice(0, 4096) || "Console error");
        captureClientException(error, { source: "console" });
      }
    } catch { /* Preserve the original console even if observation fails. */ }
    original.apply(console, args);
  };
  state.consoleObserved = true;
}

export function initializeClientTelemetry(): boolean {
  if (typeof window === "undefined") return false;
  const state = clientState();
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
      // The SDK alone owns initial/history/query pageviews; anchors are not new pages.
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
        if (!["$pageview", "$exception"].includes(event.event) && !event.event.startsWith("hackuniverse-")) return null;
        try {
          return sanitizeTelemetryEvent({
            ...event,
            properties: {
              ...event.properties,
              ...eventContext("browser"),
              source: event.properties.source ?? (event.event === "$exception" ? "browser-automatic" : "navigation"),
              ...(event.event === "$exception" ? { exception_id: event.properties.exception_id ?? event.uuid } : {}),
            },
          });
        } catch { return null; }
      },
      loaded(instance) {
        state.unsubscribe?.();
        state.unsubscribe = instance.on("eventCaptured", onCaptured);
      },
    });
    state.initialized = true;
    try { observeConsole(state); } catch { /* A locked console must not block analytics. */ }
    return true;
  } catch {
    state.unsubscribe?.();
    state.unsubscribe = undefined;
    return false;
  } finally { state.starting = false; }
}

/** Use code-owned context; never pass imported content, input values or request bodies. */
export function captureEvent(name: TelemetryEventName, properties: Record<string, unknown> = {}): void {
  if (!name.startsWith("hackuniverse-") || !initializeClientTelemetry()) return;
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
