import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import posthog, { type CaptureResult, type PostHogConfig } from "posthog-js/no-external";
import { captureClientException, captureEvent, initializeClientTelemetry } from "./client";
import type { TelemetryEventName } from "./shared";

const stateKey = Symbol.for("hackuniverse.telemetry.client");
const root = globalThis as typeof globalThis & { [key: symbol]: unknown };

function setup(t: TestContext) {
  const variables = ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_ENABLED"] as const;
  const previous = variables.map((name) => [name, process.env[name]] as const);
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousState = root[stateKey];
  const previousConsoleError = console.error;
  const consoleCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => { consoleCalls.push(args); };
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
    console.error = previousConsoleError;
  });
  let configuration: Partial<PostHogConfig> = {};
  let listener: ((event: CaptureResult) => void) | undefined;
  let unsubscriptions = 0;
  const subscribe = t.mock.method(posthog, "on", (...[, callback]: Parameters<typeof posthog.on>) => {
    listener = callback;
    return () => { unsubscriptions++; listener = undefined; };
  });
  const initialize = t.mock.method(posthog, "init", (...[, options]: Parameters<typeof posthog.init>) => {
    configuration = options ?? {};
    configuration.loaded?.(posthog);
    return posthog;
  });
  const capture = t.mock.method(posthog, "capture", (...[event, properties]: Parameters<typeof posthog.capture>) => ({ uuid: "hackuniverse-captured-test", event, properties: properties ?? {} }));
  const captureException = t.mock.method(posthog, "captureException", () => ({ uuid: "hackuniverse-exception-test", event: "$exception", properties: {} }));
  return { initialize, capture, captureException, subscribe, consoleCalls, configuration: () => configuration, listener: () => listener, unsubscriptions: () => unsubscriptions };
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

test("one global initialization owns query-aware pageviews and one companion listener", (t) => {
  const sdk = setup(t);
  assert.equal(initializeClientTelemetry(), true);
  assert.equal(initializeClientTelemetry(), true);
  captureEvent("hackuniverse-custom");
  assert.equal(sdk.initialize.mock.callCount(), 1);
  assert.equal(sdk.subscribe.mock.callCount(), 1);
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

test("native pageviews stay single and exceptions alone get one prefixed companion", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  const listener = sdk.listener();
  assert.ok(listener);
  listener({ uuid: "hackuniverse-page-id", event: "$pageview", properties: { source: "navigation", $current_url: "https://app.example/design?lang=en" } });
  assert.equal(sdk.capture.mock.callCount(), 0);
  listener({ uuid: "hackuniverse-error-id", event: "$exception", properties: { exception_id: "hackuniverse-error-id", $exception_list: [{ type: "Error", value: "hackuniverse-test" }] } });
  listener({ uuid: "hackuniverse-companion-id", event: "hackuniverse-exception", properties: {} });
  assert.deepEqual(sdk.capture.mock.calls.map((call) => call.arguments[0]), ["hackuniverse-exception"]);
  assert.equal(sdk.capture.mock.calls[0].arguments[1]?.exception_id, "hackuniverse-error-id");
});

test("custom event API rejects unprefixed names at runtime and isolates transport failures", (t) => {
  const sdk = setup(t);
  captureEvent("wrong-name" as TelemetryEventName);
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
  assert.equal(sdk.subscribe.mock.callCount(), 1);
});

test("companion and exception SDK failures never replace application recovery", (t) => {
  const sdk = setup(t);
  initializeClientTelemetry();
  sdk.capture.mock.mockImplementation(() => { throw new Error("hackuniverse-companion-failure"); });
  assert.doesNotThrow(() => sdk.listener()?.({ uuid: "hackuniverse-native-id", event: "$exception", properties: {} }));
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
  for (const event of ["$set", "$identify", "$groupidentify", "$create_alias", "unprefixed-product-event"]) {
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
