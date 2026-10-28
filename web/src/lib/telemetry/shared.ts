export const telemetryApp = "hackuniverse-web";
export const eventPrefix = "hackuniverse-";
export type TelemetryEventName = `${typeof eventPrefix}${string}`;
export type TelemetryRuntime = "browser" | "server";

/** SDK-owned events must not acquire a second custom alias. */
export function isCustomEventName(value: unknown): value is TelemetryEventName {
  return typeof value === "string" && value.startsWith(eventPrefix) && value.length > eventPrefix.length
    && value !== "hackuniverse-pageview" && value !== "hackuniverse-exception";
}

type ConfigurationInput = { token?: string; host?: string; enabled?: string };

/** Only an ingestion token belongs in browser configuration, never a personal API key. */
export function readTelemetryConfiguration({ token, host, enabled }: ConfigurationInput) {
  if (enabled === "false" || !token?.trim().startsWith("phc_")) return null;
  try {
    const url = new URL(host || "https://us.i.posthog.com");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return { token: token.trim(), host: url.href.replace(/\/$/, "") };
  } catch { return null; }
}

function redact(value: string): string {
  return value
    .replace(/\b(?:Bearer|Basic)\s+[\w.+/=_~-]+/gi, "[redacted authorization]")
    .replace(/\b(?:ph[cpx]_|sk-|fc-)[A-Za-z0-9_-]{10,}\b/g, "[redacted token]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[redacted token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted email]")
    .replace(/((?:["']?)(?:password|secret|token|api[_-]?key|authorization|cookie|code)(?:["']?)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&}]+)/gi, "$1[redacted]");
}

/** Retain route and the allowlisted interface language, never arbitrary search/hash data. */
export function sanitizeUrl(value: string, base = "https://hackuniverse.invalid"): string {
  try {
    const url = new URL(value, base);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "[redacted URL]";
    const languages = url.searchParams.getAll("lang");
    const lang = languages.length === 1 && ["en", "pt-BR"].includes(languages[0]) ? languages[0] : null;
    const path = redact(url.pathname);
    return `${url.origin}${path}${lang ? `?lang=${lang}` : ""}`;
  } catch { return "[redacted URL]"; }
}

export function sanitizeText(value: string): string {
  // Consume HTTP locations as whole tokens so /Users in a web route is not
  // mistaken for a filesystem home. Local components allow spaces, but cannot
  // cross a stack-frame delimiter/newline; component count and size are bounded.
  const locations = /https?:\/\/[^\s"'<>]+|(?:file:\/\/\/?)?(?:[A-Za-z]:)?[/\\](?:Users|home)[/\\](?:[^/\\\r\n:)]{1,255}[/\\]){1,64}?(?=(?:src|\.next|node_modules)[/\\])/gi;
  return redact(value.slice(0, 16384).replace(locations, (location) => /^https?:\/\//i.test(location)
    ? sanitizeUrl(location) : `[local]${location.slice(-1)}`))
    .slice(0, 4096);
}

const blockedFields = /^(?:\$set|\$set_once|headers?|cookies?|body|request|response|authorization|password|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|vars|pre_context|post_context|context_line|data)$/i;
const contextFields = new Set([
  "source", "operation", "route", "path", "pathname", "method", "route_type", "router_kind", "render_source", "digest",
  "runtime", "environment", "release", "native_event", "exception_type", "exception_message", "exception_level", "handled", "exception_id", "validation_id",
]);
const sdkFields = new Set([
  "distinct_id", "$device_id", "$session_id", "$window_id", "$insert_id", "$lib", "$lib_version", "$browser", "$browser_version",
  "$os", "$os_version", "$device_type", "$screen_width", "$screen_height", "$viewport_width", "$viewport_height", "$host", "$pathname",
  "$current_url", "$referrer", "$referring_domain", "$is_identified", "$process_person_profile", "$anon_distinct_id", "$sent_at", "$sdk_debug_extensions_summary",
]);
const forcedFields = new Set(["app", "app_name", "event_prefix", "lang"]);

function isAcceptedProperty(key: string): boolean {
  return key === "token" || contextFields.has(key) || sdkFields.has(key) || key.startsWith("$exception_");
}

/** Names only: developer feedback must never serialize private property values. */
export function droppedCustomPropertyNames(properties: Record<string, unknown>): string[] {
  const dropped: string[] = [];
  for (const key of Object.keys(properties)) {
    if (!isAcceptedProperty(key) && !forcedFields.has(key)) dropped.push(sanitizeText(key).slice(0, 128));
    if (dropped.length === 100) break;
  }
  return dropped;
}

function sanitizeRoute(value: string): string {
  const url = new URL(sanitizeUrl(value), "https://hackuniverse.invalid");
  return `${url.pathname}${url.search}`;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 10) return undefined;
  if (typeof value === "string") return sanitizeText(value);
  if (typeof value === "boolean" || value === null) return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).filter(([key]) => !blockedFields.test(key)).slice(0, 100)
      .map(([key, item]) => [key, sanitizeValue(item, depth + 1)]));
  }
  return undefined;
}

export function eventContext(runtime: TelemetryRuntime, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...extra,
    app: "hackuniverse",
    app_name: telemetryApp,
    event_prefix: eventPrefix,
    runtime,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV || "development",
    ...(process.env.NEXT_PUBLIC_APP_VERSION ? { release: process.env.NEXT_PUBLIC_APP_VERSION } : {}),
  };
}

/** One transport policy for automatic, manual, client and server events. */
export function sanitizeTelemetryEvent<T extends { event: string; properties?: Record<string, unknown> }>(event: T): T {
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event.properties ?? {})) {
    // The browser transport requires its public ingestion token unchanged.
    if (key === "token") { if (typeof value === "string" && value.startsWith("phc_")) properties[key] = value; continue; }
    if (isAcceptedProperty(key)) {
      properties[key] = typeof value === "string" && ["$current_url", "$referrer"].includes(key) ? sanitizeUrl(value)
        : typeof value === "string" && ["path", "pathname", "route", "$pathname"].includes(key) ? sanitizeRoute(value)
          : sanitizeValue(value);
    }
  }
  const url = typeof properties.$current_url === "string" ? new URL(properties.$current_url, "https://hackuniverse.invalid") : null;
  if (url && url.protocol.startsWith("http")) {
    properties.pathname = url.pathname;
    properties.$pathname = url.pathname;
    properties.lang = url.searchParams.get("lang") ?? "en";
  }
  properties.app = "hackuniverse";
  properties.app_name = telemetryApp;
  properties.event_prefix = eventPrefix;
  properties.$process_person_profile = false;
  const result = { ...event, properties } as T & { $set?: unknown; $set_once?: unknown; $unset?: unknown };
  delete result.$set;
  delete result.$set_once;
  delete result.$unset;
  return result;
}
