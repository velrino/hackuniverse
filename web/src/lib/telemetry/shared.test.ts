import assert from "node:assert/strict";
import test from "node:test";
import {
  companionEvent,
  eventContext,
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

test("only native exceptions produce prefixed companions; pageviews stay native", () => {
  const page = companionEvent(transport({ event: "$pageview", properties: { $current_url: "https://app.example/design?lang=en&token=hackuniverse-private", source: "hackuniverse-check" } }));
  assert.equal(page, null);
  const exception = companionEvent(transport({ event: "$exception", properties: {
    exception_id: "hackuniverse-error-id", $exception_list: [{ type: "TypeError", value: "Failed token=hackuniverse-private", stacktrace: { frames: [] } }],
  } }));
  assert.equal(exception?.event, "hackuniverse-exception");
  assert.equal(exception?.properties.native_event, "$exception");
  assert.equal((exception?.properties as Record<string, unknown> | undefined)?.exception_id, "hackuniverse-error-id");
  assert.equal(exception?.properties.exception_type, "TypeError");
  assert.ok(!JSON.stringify(exception).includes("hackuniverse-private"));
  assert.ok(!("$exception_list" in (exception?.properties ?? {})));
  for (const event of ["hackuniverse-pageview", "hackuniverse-exception", "$identify", "$pageleave", "hackuniverse-custom"]) assert.equal(companionEvent({ event }), null);
});

test("event context never accepts an application/runtime override", () => {
  const context = eventContext("server", { app: "wrong", app_name: "wrong", event_prefix: "wrong", runtime: "browser", source: "hackuniverse-check" });
  assert.equal(context.app, "hackuniverse");
  assert.equal(context.app_name, "hackuniverse-web");
  assert.equal(context.event_prefix, "hackuniverse-");
  assert.equal(context.runtime, "server");
  assert.equal(context.source, "hackuniverse-check");
});
