import assert from "node:assert/strict";
import test from "node:test";
import {
  droppedCustomPropertyNames,
  eventContext,
  isCustomEventName,
  readTelemetryConfiguration,
  sanitizeTelemetryEvent,
  sanitizeText,
  sanitizeUrl,
} from "./shared";

const ingestionToken = "phc_hackuniverse_synthetic_ingestion";
const transport = (event: { event: string; properties: Record<string, unknown> }) => sanitizeTelemetryEvent(event);

test("telemetry requires an ingestion token and respects explicit disablement", () => {
  for (const token of [undefined, "", "  ", "phx_hackuniverse_synthetic_personal"]) {
    assert.equal(readTelemetryConfiguration({ token }), null);
  }
  assert.equal(readTelemetryConfiguration({ token: ingestionToken, enabled: "false" }), null);
  assert.deepEqual(readTelemetryConfiguration({ token: ` ${ingestionToken} ` }), {
    token: ingestionToken, host: "https://us.i.posthog.com",
  });
});

test("ingestion host rejects insecure, credential-bearing and query-bearing URLs", () => {
  for (const host of ["not a host", "http://ingest.example", "https://hackuniverse:secret@ingest.example", "https://ingest.example?key=secret", "https://ingest.example#secret"]) {
    assert.equal(readTelemetryConfiguration({ token: ingestionToken, host }), null);
  }
  assert.deepEqual(readTelemetryConfiguration({ token: ingestionToken, host: "https://ingest.example/proxy/" }), {
    token: ingestionToken, host: "https://ingest.example/proxy",
  });
});

test("page URLs retain only route and one allowlisted interface language", () => {
  assert.equal(sanitizeUrl("https://hackuniverse:password@app.example/design?lang=pt-BR&token=hackuniverse-secret#inputs"), "https://app.example/design?lang=pt-BR");
  assert.equal(sanitizeUrl("/example?lang=en&note=hackuniverse-private#fragment", "https://app.example"), "https://app.example/example?lang=en");
  for (const query of ["lang=invalid", "lang=en&lang=pt-BR", "code=hackuniverse-secret", "lang="]) {
    assert.equal(sanitizeUrl(`https://app.example/design?${query}#private`), "https://app.example/design");
  }
});

test("URL sanitization suppresses unsupported schemes and malformed origins", () => {
  for (const value of ["javascript:alert(1)", "data:text/plain,hackuniverse-private", "https://[invalid"]) {
    assert.equal(sanitizeUrl(value), "[redacted URL]");
  }
});

test("diagnostic messages redact common authorization, token and email values", () => {
  const message = sanitizeText('Bearer hackuniverse-auth-secret Basic aGFja3VuaXZlcnNl phx_hackuniverse_personal_test fc-hackuniverse_provider_test sk-hackuniverse_provider_test eyJhbGciOiJub25lIn0.eyJ0ZXN0Ijp0cnVlfQ.hackuniverseSignature person@hackuniverse.example token=hackuniverse-secret password="hackuniverse password"');
  for (const privateValue of ["hackuniverse-auth-secret", "aGFja3VuaXZlcnNl", "phx_hackuniverse_personal_test", "fc-hackuniverse_provider_test", "sk-hackuniverse_provider_test", "eyJhbGci", "person@hackuniverse.example", "hackuniverse-secret", "hackuniverse password"]) {
    assert.ok(!message.includes(privateValue));
  }
  assert.match(message, /redacted/);
});

test("diagnostics strip search and fragment data from embedded URLs", () => {
  const result = sanitizeText("Could not load https://app.example/model?token=hackuniverse-secret&lang=en#private");
  assert.equal(result, "Could not load https://app.example/model?lang=en");
  assert.ok(sanitizeText("x".repeat(5000)).length <= 4096);
});

test("developer-local source paths retain useful source locations without home folders", () => {
  const result = sanitizeText("at render (/Users/hackuniverse-private/workspace/web/src/page.tsx:10:2)");
  assert.ok(!result.includes("hackuniverse-private"));
  assert.match(result, /\[local\]\/src\/page.tsx:10:2/);
});

test("nested local stack paths support Windows drives, spaces, case and file URLs", () => {
  const locations = [
    [String.raw`C:\Users\Jane Doe\Projects\Hack Universe\web\src\page.tsx:10:2`, String.raw`[local]\src\page.tsx:10:2`],
    [String.raw`c:\users\private profile\work\app\.next\server\app.js:21:7`, String.raw`[local]\.next\server\app.js:21:7`],
    ["C:/Users/Jane Doe/Projects/Hack Universe/web/src/page.tsx:11:3", "[local]/src/page.tsx:11:3"],
    ["/home/jane doe/Projects/Hack Universe/node_modules/pkg/index.js:6:2", "[local]/node_modules/pkg/index.js:6:2"],
    ["file:///C:/Users/Jane%20Doe/Projects/Hack%20Universe/web/src/page.tsx:3:9", "[local]/src/page.tsx:3:9"],
    ["file:///Users/Jane Doe/Projects/Hack Universe/web/src/page.tsx:4:8", "[local]/src/page.tsx:4:8"],
  ];
  for (const [location, expected] of locations) {
    assert.equal(sanitizeText(`at render (${location})`), `at render (${expected})`);
  }
});

test("local path redaction cannot consume neighboring stack frames or HTTP routes", () => {
  assert.equal(sanitizeText(String.raw`TypeError: synthetic
at render (C:\Users\Jane Doe\Projects\Hack Universe\web\src\page.tsx:10:2)
at load (/Users/Jane Doe/Projects/Hack Universe/web/.next/server/app.js:4:5)`), String.raw`TypeError: synthetic
at render ([local]\src\page.tsx:10:2)
at load ([local]/.next/server/app.js:4:5)`);
  assert.equal(sanitizeText("Source https://app.example/Users/public/work/src/page.js?lang=pt-BR&token=synthetic-private"),
    "Source https://app.example/Users/public/work/src/page.js?lang=pt-BR");
  assert.equal(sanitizeText("Source https://app.example/home/public/work/node_modules/pkg/index.js"),
    "Source https://app.example/home/public/work/node_modules/pkg/index.js");
});

test("transport preserves native exception structure while dropping sensitive nested context", () => {
  const original = {
    event: "$exception",
    properties: {
      token: ingestionToken,
      distinct_id: "hackuniverse-anonymous-test",
      runtime: "browser",
      source: "react-boundary",
      $current_url: "https://app.example/design?lang=pt-BR&secret=hackuniverse-query#private",
      $exception_level: "error",
      $exception_list: [{
        type: "TypeError", value: "Failed Bearer hackuniverse-token",
        mechanism: { type: "generic", handled: true, data: { body: "hackuniverse-private" } },
        stacktrace: { frames: [{
          function: "render", filename: "https://app.example/chunk.js?token=hackuniverse-secret", lineno: 4,
          vars: { input: "hackuniverse-private" }, context_line: "hackuniverse-private",
          pre_context: ["hackuniverse-private"], post_context: ["hackuniverse-private"],
        }] },
        headers: { authorization: "hackuniverse-private" }, cookies: "hackuniverse-private", request: { body: "hackuniverse-private" },
      }],
      $set: { email: "person@hackuniverse.example" },
      $set_once: { $initial_referrer: "https://app.example?secret=hackuniverse-private" },
      body: "hackuniverse-private", headers: { cookie: "hackuniverse-private" }, input: "hackuniverse-private",
    },
  };
  const copy = structuredClone(original);
  const result = transport(original);
  assert.deepEqual(original, copy, "transport sanitization must not mutate shared SDK/caller objects");
  assert.equal(result.event, "$exception");
  assert.equal(result.properties.token, ingestionToken, "SDK ingestion authentication must survive");
  assert.equal(result.properties.distinct_id, "hackuniverse-anonymous-test");
  assert.equal(result.properties.$current_url, "https://app.example/design?lang=pt-BR");
  assert.equal(result.properties.pathname, "/design");
  assert.equal(result.properties.lang, "pt-BR");
  assert.equal(result.properties.app, "hackuniverse");
  assert.equal(result.properties.app_name, "hackuniverse-web");
  assert.equal(result.properties.event_prefix, "hackuniverse-");
  const serialized = JSON.stringify(result);
  for (const privateValue of ["hackuniverse-private", "hackuniverse-query", "hackuniverse-secret", "hackuniverse-token", "person@hackuniverse.example"]) assert.ok(!serialized.includes(privateValue));
  const exception = (result.properties.$exception_list as { type: string; mechanism: unknown; stacktrace: { frames: unknown[] } }[])[0];
  assert.equal(exception.type, "TypeError");
  assert.deepEqual(exception.mechanism, { type: "generic", handled: true });
  assert.deepEqual(exception.stacktrace.frames, [{ function: "render", filename: "https://app.example/chunk.js", lineno: 4 }]);
});

test("all events have forced application scope and only allowlisted metadata", () => {
  const result = transport({ event: "hackuniverse-test", properties: {
    app: "wrong-app", app_name: "wrong-app", event_prefix: "wrong-", source: "hackuniverse-check",
    $process_person_profile: true,
    email: "person@hackuniverse.example", note: "hackuniverse-private", $set: { private: true },
  } });
  assert.equal(result.properties.app, "hackuniverse");
  assert.equal(result.properties.app_name, "hackuniverse-web");
  assert.equal(result.properties.event_prefix, "hackuniverse-");
  assert.equal(result.properties.source, "hackuniverse-check");
  assert.equal(result.properties.$process_person_profile, false);
  assert.ok(!("email" in result.properties));
  assert.ok(!("note" in result.properties));
  assert.ok(!("$set" in result.properties));
});

test("top-level SDK person payloads cannot bypass the transport privacy policy", () => {
  const original = {
    event: "$pageview", properties: { $current_url: "https://app.example/" },
    $set: { email: "person@hackuniverse.example", note: "hackuniverse-private-note" },
    $set_once: { $initial_referrer: "https://app.example?secret=hackuniverse-private-query" },
    $unset: ["hackuniverse-private-property"],
  };
  const result = sanitizeTelemetryEvent(original);
  for (const key of ["$set", "$set_once", "$unset"]) assert.ok(!(key in result));
  assert.ok(!JSON.stringify(result).includes("hackuniverse-private"));
  assert.ok(original.$set.email, "the source object stays intact for other consumers");
});

test("relative route context cannot leak arbitrary query or fragment values", () => {
  const result = transport({ event: "hackuniverse-test", properties: {
    route: "/design?note=hackuniverse-private-route#hackuniverse-private-fragment",
    path: "/example?lang=pt-BR&note=hackuniverse-private-path",
    pathname: "/missing?note=hackuniverse-private-pathname",
    $pathname: "/design?note=hackuniverse-private-sdk-pathname",
  } });
  assert.equal(result.properties.route, "/design");
  assert.equal(result.properties.path, "/example?lang=pt-BR");
  assert.equal(result.properties.pathname, "/missing");
  assert.equal(result.properties.$pathname, "/design");
  assert.ok(!JSON.stringify(result).includes("hackuniverse-private"));
});

test("cyclic and oversized exception metadata cannot cause unbounded serialization", () => {
  const cycle: Record<string, unknown> = {};
  cycle.cause = cycle;
  const result = transport({ event: "$exception", properties: {
    $exception_list: Array.from({ length: 150 }, () => ({ type: "Error", value: "hackuniverse-test", cause: cycle })),
  } });
  assert.equal((result.properties.$exception_list as unknown[]).length, 100);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("custom product events cannot use native events or legacy automatic aliases", () => {
  assert.equal(isCustomEventName("hackuniverse-import-started"), true);
  for (const event of [undefined, null, 1, "", "hackuniverse-", "$pageview", "$exception", "$identify", "pageview", "hackuniverse-pageview", "hackuniverse-exception"]) {
    assert.equal(isCustomEventName(event), false);
  }
});

test("dropped custom-property feedback shares the transport allowlist and returns names only", () => {
  const accepted = {
    token: ingestionToken, source: "navigation", operation: "import", runtime: "browser",
    $current_url: "https://app.example/design?lang=en", $exception_list: [{ type: "Error", value: "synthetic" }],
    $session_id: "synthetic-session", distinct_id: "synthetic-anonymous",
    app: "hackuniverse", app_name: "hackuniverse-web", event_prefix: "hackuniverse-", lang: "en",
  };
  assert.deepEqual(droppedCustomPropertyNames(accepted), []);
  const properties = { ...accepted, import_count: 3, private_note: "synthetic-private-value" };
  assert.deepEqual(droppedCustomPropertyNames(properties), ["import_count", "private_note"]);
  const sanitized = transport({ event: "hackuniverse-import-started", properties }).properties;
  assert.ok(!("import_count" in sanitized));
  assert.ok(!("private_note" in sanitized));
  assert.ok(!JSON.stringify(droppedCustomPropertyNames(properties)).includes("synthetic-private-value"));
});

test("dropped-property diagnostics do not evaluate values and bound the number of names", () => {
  const properties = Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`unknown_${index}`, "synthetic-private-value"]));
  Object.defineProperty(properties, "getter_value", { enumerable: true, get() { throw new Error("must not read values"); } });
  assert.equal(droppedCustomPropertyNames(properties).length, 100);
  assert.deepEqual(droppedCustomPropertyNames(Object.defineProperty({}, "getter_value", {
    enumerable: true, get() { throw new Error("must not read values"); },
  })), ["getter_value"]);
});

test("dynamic property names are redacted and individually bounded before diagnostics", () => {
  assert.deepEqual(droppedCustomPropertyNames({
    "person@hackuniverse.example": true,
    [String.raw`C:\Users\Jane Doe\Projects\Hack Universe\web\src\page.tsx:10:2`]: true,
    ["x".repeat(1000)]: true,
  }), ["[redacted email]", String.raw`[local]\src\page.tsx:10:2`, "x".repeat(128)]);
});

test("event context never accepts an application/runtime override", () => {
  const context = eventContext("server", { app: "wrong", app_name: "wrong", event_prefix: "wrong", runtime: "browser", source: "hackuniverse-check" });
  assert.equal(context.app, "hackuniverse");
  assert.equal(context.app_name, "hackuniverse-web");
  assert.equal(context.event_prefix, "hackuniverse-");
  assert.equal(context.runtime, "server");
  assert.equal(context.source, "hackuniverse-check");
});
