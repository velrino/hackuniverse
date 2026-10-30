import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import posthog, { type PostHogConfig } from "posthog-js/no-external";
import { captureClientException, captureEvent, initializeClientTelemetry } from "./client";
import type { TelemetryEventName } from "./shared";

const stateKey = Symbol.for("hackuniverse.telemetry.client");
const root = globalThis as typeof globalThis & { [key: symbol]: unknown };

function setup(t: TestContext) {
  const variables = ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_ENABLED"] as const;
  const previous = variables.map((name) => [name, process.env[name]] as const);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousState = root[stateKey];
  const previousEnvironment = process.env.NODE_ENV;
  const previousConsoleError = console.error;
  const previousConsoleWarn = console.warn;
  const consoleCalls: unknown[][] = [];
  const warningCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => { consoleCalls.push(args); };
  console.warn = (...args: unknown[]) => { warningCalls.push(args); };
  Reflect.set(process.env, "NODE_ENV", "test");
  delete root[stateKey];
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_hackuniverse_synthetic_client";
  process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://telemetry.example.test";
  delete process.env.NEXT_PUBLIC_POSTHOG_ENABLED;
  t.after(() => {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor); else Reflect.deleteProperty(globalThis, "window");
    if (previousState === undefined) delete root[stateKey]; else root[stateKey] = previousState;
    if (previousEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV"); else Reflect.set(process.env, "NODE_ENV", previousEnvironment);
    console.error = previousConsoleError;
    console.warn = previousConsoleWarn;
  });
  let configuration: Partial<PostHogConfig> = {};
  const subscribe = t.mock.method(posthog, "on", () => () => {});
  const initialize = t.mock.method(posthog, "init", (...[, options]: Parameters<typeof posthog.init>) => {
    configuration = options ?? {};
    return posthog;
  });
  const capture = t.mock.method(posthog, "capture", (...[event, properties]: Parameters<typeof posthog.capture>) => ({ uuid: "hackuniverse-captured-test", event, properties: properties ?? {} }));
  const captureException = t.mock.method(posthog, "captureException", () => ({ uuid: "hackuniverse-exception-test", event: "$exception", properties: {} }));
  return { initialize, capture, captureException, subscribe, consoleCalls, warningCalls, configuration: () => configuration };
}

test("client telemetry does nothing during SSR or when missing/disabled", (t) => {
  const sdk = setup(t);
  Object.defineProperty(globalThis, "window", { configurable: true, value: undefined });
  assert.equal(initializeClientTelemetry(), false);
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  assert.equal(initializeClientTelemetry(), false);
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_hackuniverse_synthetic_client";
  process.env.NEXT_PUBLIC_POSTHOG_ENABLED = "false";
  captureEvent("hackuniverse-disabled");
  captureClientException(new Error("hackuniverse-disabled"));
  assert.equal(sdk.initialize.mock.callCount(), 0);
  assert.equal(sdk.capture.mock.callCount(), 0);
  assert.equal(sdk.captureException.mock.callCount(), 0);
});

test("one global initialization leaves query-aware pageviews and native exceptions to the SDK", (t) => {
  const sdk = setup(t);
  assert.equal(initializeClientTelemetry(), true);
  assert.equal(initializeClientTelemetry(), true);
  captureEvent("hackuniverse-custom");
  assert.equal(sdk.initialize.mock.callCount(), 1);
  assert.equal(sdk.subscribe.mock.callCount(), 0);
  assert.equal(sdk.configuration().loaded, undefined);
  assert.deepEqual(sdk.configuration().capture_pageview, { path: true, search: true, hash: false });
  assert.equal(sdk.configuration().capture_pageleave, false);
  assert.equal(sdk.configuration().autocapture, false);
  assert.equal(sdk.configuration().disable_session_recording, true);
  assert.equal(sdk.configuration().disable_external_dependency_loading, true);
  assert.equal(sdk.configuration().person_profiles, "never");
  assert.deepEqual(sdk.configuration().capture_exceptions, { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: false });
});

test("automatic and manual native events share transport sanitization and app context", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  assert.equal(typeof beforeSend, "function");
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  const result = beforeSend({ uuid: "hackuniverse-native-id", event: "$exception", properties: {
    $current_url: "https://app.example/design?lang=pt-BR&token=hackuniverse-secret#private", input: "hackuniverse-private", $exception_list: [{ type: "Error", value: "hackuniverse-check" }],
  } });
  assert.ok(result);
  assert.equal(result.event, "$exception");
  assert.equal(result.properties.app_name, "hackuniverse-web");
  assert.equal(result.properties.runtime, "browser");
  assert.equal(result.properties.source, "browser-automatic");
  assert.equal(result.properties.$process_person_profile, false);
  assert.equal(result.properties.exception_id, "hackuniverse-native-id");
  assert.equal(result.properties.$current_url, "https://app.example/design?lang=pt-BR");
  assert.ok(!JSON.stringify(result).includes("hackuniverse-secret"));
  assert.ok(!JSON.stringify(result).includes("hackuniverse-private"));
});

test("native pageviews and exceptions pass through without creating custom companions", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  for (const event of ["$pageview", "$exception"]) {
    const result = beforeSend({ uuid: `hackuniverse-native-${event}`, event, properties: { $current_url: "https://app.example/design?lang=en" } });
    assert.ok(result);
    assert.equal(result.event, event);
  }
  captureClientException(new Error("hackuniverse-native-only"));
  assert.equal(sdk.captureException.mock.callCount(), 1);
  assert.equal(sdk.capture.mock.callCount(), 0);
  assert.equal(sdk.subscribe.mock.callCount(), 0);
});

test("camera-only history changes send one native pageview for the sanitized page", (t) => {
  const sdk = setup(t); initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  const pageview = (url: string) => beforeSend({ uuid: "synthetic-pageview", event: "$pageview", properties: { $current_url: url } });
  const first = pageview("https://app.example/?lang=en&target=earth&camera=1,2,3,0,0,0&source=demo#first");
  assert.ok(first);
  assert.equal(first.event, "$pageview");
  assert.equal(first.properties.$current_url, "https://app.example/?lang=en");
  for (const url of [
    "https://app.example/?lang=en&target=neptune&camera=4,5,6,0,0,0&source=demo#second",
    "https://app.example/?source=local&camera=7,8,9,0,0,0&target=other&lang=en",
    "https://app.example/?lang=en",
  ]) assert.equal(pageview(url), null);
  assert.equal(sdk.capture.mock.callCount(), 0, "dedup does not create a custom pageview companion");
  assert.equal(sdk.subscribe.mock.callCount(), 0, "the SDK remains the only navigation observer");
});

test("pageview dedup preserves language, route changes and a later return to the same page", (t) => {
  const sdk = setup(t); initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  for (const url of ["https://app.example/?lang=en", "https://app.example/?lang=pt-BR", "https://app.example/example?lang=pt-BR", "https://app.example/?lang=en"]) {
    assert.ok(beforeSend({ uuid: "synthetic-navigation", event: "$pageview", properties: { $current_url: url } }), url);
  }
});

test("exceptions and product events remain independent from consecutive pageview dedup", (t) => {
  const sdk = setup(t); initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  const properties = { $current_url: "https://app.example/?lang=en&camera=1,2,3,0,0,0" };
  assert.ok(beforeSend({ uuid: "synthetic-first-pageview", event: "$pageview", properties }));
  for (const event of ["$exception", "$exception", "hackuniverse-location-shared"]) {
    const captured = beforeSend({ uuid: "synthetic-other-event", event, properties });
    assert.ok(captured); assert.equal(captured.event, event);
  }
  assert.equal(beforeSend({ uuid: "synthetic-repeated-pageview", event: "$pageview", properties }), null);
});

test("a fresh document accepts its initial pageview even when the previous document used the same URL", (t) => {
  const sdk = setup(t); initializeClientTelemetry();
  const previousSend = sdk.configuration().before_send;
  if (typeof previousSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  const event = { uuid: "synthetic-refresh", event: "$pageview", properties: { $current_url: "https://app.example/?lang=en" } };
  assert.ok(previousSend(event)); assert.equal(previousSend(event), null);
  // A document refresh replaces the global object; setup removes only this app's state.
  delete root[stateKey]; initializeClientTelemetry();
  const nextSend = sdk.configuration().before_send;
  if (typeof nextSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  assert.ok(nextSend(event));
});

test("unkeyed pageviews are not collapsed into a guessed URL", (t) => {
  const sdk = setup(t); initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  const valid = { uuid: "synthetic-url", event: "$pageview", properties: { $current_url: "https://app.example/?lang=en" } };
  assert.ok(beforeSend(valid));
  assert.ok(beforeSend({ uuid: "synthetic-no-url", event: "$pageview", properties: {} }));
  assert.ok(beforeSend(valid));
});

test("development replacement removes an older companion listener exactly once", (t) => {
  const sdk = setup(t);
  let unsubscriptions = 0;
  root[stateKey] = { initialized: true, starting: false, reported: new WeakSet(), unsubscribe() { unsubscriptions++; } };
  assert.equal(initializeClientTelemetry(), true);
  assert.equal(initializeClientTelemetry(), true);
  assert.equal(unsubscriptions, 1);
  assert.equal(sdk.initialize.mock.callCount(), 0);
  assert.equal(sdk.subscribe.mock.callCount(), 0);
});

test("failure to remove an older companion listener cannot prevent telemetry reuse", (t) => {
  const sdk = setup(t);
  root[stateKey] = { initialized: true, starting: false, reported: new WeakSet(), unsubscribe() { throw new Error("Synthetic legacy cleanup failure"); } };
  assert.equal(initializeClientTelemetry(), true);
  captureEvent("hackuniverse-product-event");
  assert.equal(sdk.capture.mock.callCount(), 1);
});

test("custom event API rejects unprefixed names at runtime and isolates transport failures", (t) => {
  const sdk = setup(t);
  for (const name of ["wrong-name", "hackuniverse-", "hackuniverse-pageview", "hackuniverse-exception"]) captureEvent(name as TelemetryEventName);
  assert.equal(sdk.initialize.mock.callCount(), 0);
  sdk.capture.mock.mockImplementation(() => { throw new Error("hackuniverse-network-failure"); });
  assert.doesNotThrow(() => captureEvent("hackuniverse-test"));
});

test("handled errors deduplicate only after capture succeeds and cancellations are skipped", (t) => {
  const sdk = setup(t);
  const error = new Error("hackuniverse-same-error");
  sdk.captureException.mock.mockImplementationOnce(() => undefined);
  captureClientException(error, { source: "react-boundary" });
  captureClientException(error, { source: "react-boundary" });
  captureClientException(error, { source: "react-boundary" });
  assert.equal(sdk.captureException.mock.callCount(), 2);
  captureClientException(new Error("hackuniverse-same-message-new-occurrence"));
  assert.equal(sdk.captureException.mock.callCount(), 3);
  captureClientException(Object.assign(new Error("hackuniverse-cancel"), { name: "AbortError" }));
  assert.equal(sdk.captureException.mock.callCount(), 3);
});

test("failed initialization can retry without leaving the global starting guard stuck", (t) => {
  const sdk = setup(t);
  sdk.initialize.mock.mockImplementationOnce(() => { throw new Error("hackuniverse-init-failure"); });
  assert.equal(initializeClientTelemetry(), false);
  assert.equal(initializeClientTelemetry(), true);
  assert.equal(sdk.initialize.mock.callCount(), 2);
  assert.equal(sdk.subscribe.mock.callCount(), 0);
});

test("exception SDK failures never replace application recovery", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  sdk.captureException.mock.mockImplementation(() => { throw new Error("hackuniverse-sdk-failure"); });
  assert.doesNotThrow(() => captureClientException(new Error("hackuniverse-original-failure")));
});

test("console and React boundary reports share one error occurrence without swallowing console output", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  initializeClientTelemetry();
  const error = new Error("hackuniverse-react-render-failure");
  console.error("hackuniverse-react-context", error);
  captureClientException(error, { source: "react-boundary" });
  assert.equal(sdk.captureException.mock.callCount(), 1);
  assert.equal(sdk.captureException.mock.calls[0].arguments[0], error);
  assert.equal(sdk.captureException.mock.calls[0].arguments[1]?.source, "console");
  assert.deepEqual(sdk.consoleCalls, [["hackuniverse-react-context", error]]);

  const nextOccurrence = new Error("hackuniverse-react-render-failure");
  console.error(nextOccurrence);
  captureClientException(nextOccurrence, { source: "react-boundary" });
  assert.equal(sdk.captureException.mock.callCount(), 2);
  assert.equal(sdk.consoleCalls.length, 2);
  assert.equal(sdk.consoleCalls[1][0], nextOccurrence);
});

test("console diagnostics do not stringify object arguments and bound captured string text", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const privateObject = { secret: "hackuniverse-private-object", toString() { throw new Error("hackuniverse-object-should-not-be-converted"); } };
  console.error("hackuniverse-console-context", privateObject);
  const firstError = sdk.captureException.mock.calls[0].arguments[0];
  assert.ok(firstError instanceof Error);
  assert.equal(firstError.message, "hackuniverse-console-context");
  assert.equal(sdk.consoleCalls[0][1], privateObject, "the original console still receives the original object");
  console.error(privateObject);
  const objectOnly = sdk.captureException.mock.calls[1].arguments[0];
  assert.ok(objectOnly instanceof Error);
  assert.equal(objectOnly.message, "Console error");
  console.error("hackuniverse-".repeat(500));
  const longError = sdk.captureException.mock.calls[2].arguments[0];
  assert.ok(longError instanceof Error);
  assert.ok(longError.message.length <= 4096);
});

test("identical string console failures cool down while new messages and later occurrences remain observable", (t) => {
  const sdk = setup(t);
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  initializeClientTelemetry();
  console.error("Synthetic repeated string failure");
  now += 9999;
  console.error("Synthetic repeated string failure");
  assert.equal(sdk.captureException.mock.callCount(), 1);
  console.error("Synthetic distinct string failure");
  assert.equal(sdk.captureException.mock.callCount(), 2);
  now++;
  console.error("Synthetic repeated string failure");
  assert.equal(sdk.captureException.mock.callCount(), 3);
  assert.deepEqual(sdk.consoleCalls, [
    ["Synthetic repeated string failure"], ["Synthetic repeated string failure"],
    ["Synthetic distinct string failure"], ["Synthetic repeated string failure"],
  ]);
});

test("string cooldown keys use sanitized text without retaining private occurrences in captured messages", (t) => {
  const sdk = setup(t);
  t.mock.method(Date, "now", () => 1000);
  initializeClientTelemetry();
  console.error("Synthetic failure for first-person@example.test");
  console.error("Synthetic failure for second-person@example.test");
  assert.equal(sdk.captureException.mock.callCount(), 1);
  const error = sdk.captureException.mock.calls[0].arguments[0];
  assert.ok(error instanceof Error);
  assert.equal(error.message, "Synthetic failure for [redacted email]");
  assert.equal(sdk.consoleCalls.length, 2);
});

test("string cooldown has bounded history and evicts old messages without suppressing real Error occurrences", (t) => {
  const sdk = setup(t);
  t.mock.method(Date, "now", () => 1000);
  initializeClientTelemetry();
  for (let index = 0; index < 101; index++) console.error(`Synthetic bounded message ${index}`);
  assert.equal(sdk.captureException.mock.callCount(), 101);
  console.error("Synthetic bounded message 100");
  assert.equal(sdk.captureException.mock.callCount(), 101);
  console.error("Synthetic bounded message 0");
  assert.equal(sdk.captureException.mock.callCount(), 102);
  const error = new Error("Synthetic bounded message 0");
  console.error(error);
  captureClientException(error, { source: "react-boundary" });
  console.error(new Error("Synthetic bounded message 0"));
  assert.equal(sdk.captureException.mock.callCount(), 104);
  assert.equal(sdk.consoleCalls.length, 105);
});

test("SDK-internal console diagnostics stay visible without recursively reporting themselves", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const error = new Error("hackuniverse-sdk-network-failure");
  console.error("[PostHog.js] Failed to send", error);
  console.error("rrweb logger error:", error);
  assert.equal(sdk.captureException.mock.callCount(), 0);
  assert.deepEqual(sdk.consoleCalls, [["[PostHog.js] Failed to send", error], ["rrweb logger error:", error]]);
  sdk.captureException.mock.mockImplementation(() => { throw error; });
  assert.doesNotThrow(() => console.error("hackuniverse-application-failure", error));
  assert.equal(sdk.consoleCalls.length, 3);
  assert.equal(sdk.consoleCalls[2][1], error);
});

test("transport excludes person-profile protocol events while preserving scoped analytics and errors", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const beforeSend = sdk.configuration().before_send;
  if (typeof beforeSend !== "function") throw new Error("hackuniverse-test missing transport hook");
  for (const event of ["$set", "$identify", "$groupidentify", "$create_alias", "unprefixed-product-event", "hackuniverse-pageview", "hackuniverse-exception"]) {
    assert.equal(beforeSend({ uuid: "hackuniverse-filtered-id", event, properties: { $set: { email: "person@hackuniverse.example" } } }), null);
  }
  for (const event of ["$pageview", "$exception", "hackuniverse-product-event"]) {
    const captured = beforeSend({ uuid: "hackuniverse-allowed-id", event, properties: { $process_person_profile: true } });
    assert.ok(captured);
    assert.equal(captured.event, event);
    assert.equal(captured.properties.app_name, "hackuniverse-web");
    assert.equal(captured.properties.event_prefix, "hackuniverse-");
    assert.equal(captured.properties.$process_person_profile, false);
  }
});

test("production and test custom events never emit development property warnings", (t) => {
  const sdk = setup(t);
  for (const environment of ["production", "test"]) {
    Reflect.set(process.env, "NODE_ENV", environment);
    captureEvent("hackuniverse-product-event", { unexpected_field: "synthetic-private-value" });
  }
  assert.equal(sdk.warningCalls.length, 0);
  assert.equal(sdk.capture.mock.callCount(), 2);
});

test("development custom-property feedback reports names once per event and key without reading values", (t) => {
  const sdk = setup(t);
  Reflect.set(process.env, "NODE_ENV", "development");
  const properties = {
    source: "view",
    unexpected_field: { toJSON() { throw new Error("Private property must not be serialized"); } },
    get another_field(): string { throw new Error("Private property value must not be read"); },
  };
  assert.doesNotThrow(() => captureEvent("hackuniverse-product-event", properties));
  captureEvent("hackuniverse-product-event", { unexpected_field: "synthetic-private-value", another_field: "second-private-value" });
  captureEvent("hackuniverse-another-event", { unexpected_field: "third-private-value" });
  assert.equal(sdk.capture.mock.callCount(), 3);
  assert.equal(sdk.warningCalls.length, 2);
  assert.deepEqual(sdk.warningCalls.map((call) => call.slice(1)), [
    ["hackuniverse-product-event", ["unexpected_field", "another_field"]],
    ["hackuniverse-another-event", ["unexpected_field"]],
  ]);
  const warnings = JSON.stringify(sdk.warningCalls);
  for (const value of ["synthetic-private-value", "second-private-value", "third-private-value"]) assert.ok(!warnings.includes(value));
  assert.equal(sdk.captureException.mock.callCount(), 0);
});

test("development diagnostics stay bounded while analytics continues capturing", (t) => {
  const sdk = setup(t);
  Reflect.set(process.env, "NODE_ENV", "development");
  for (let index = 0; index < 150; index++) captureEvent("hackuniverse-product-event", { [`unexpected_${index}`]: "synthetic-private-value" });
  captureEvent("hackuniverse-product-event", { unexpected_0: "synthetic-private-value" });
  assert.equal(sdk.warningCalls.length, 100);
  assert.equal(sdk.capture.mock.callCount(), 151);
  assert.equal(sdk.captureException.mock.callCount(), 0);
  assert.ok(!JSON.stringify(sdk.warningCalls).includes("synthetic-private-value"));
});

test("warning failures cannot prevent custom capture or recursively produce exceptions", (t) => {
  const sdk = setup(t);
  Reflect.set(process.env, "NODE_ENV", "development");
  console.warn = () => { throw new Error("Synthetic diagnostic sink failure"); };
  assert.doesNotThrow(() => captureEvent("hackuniverse-product-event", { unexpected_field: "synthetic-private-value" }));
  assert.equal(sdk.capture.mock.callCount(), 1);
  assert.equal(sdk.captureException.mock.callCount(), 0);
  assert.equal(sdk.consoleCalls.length, 0);
});
