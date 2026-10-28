import assert from "node:assert/strict";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { PostHog } from "posthog-node";
import { onRequestError } from "../../instrumentation";
import { reportServerException } from "./server";

type CapturedEvent = { event: string; distinct_id?: string; properties: Record<string, unknown> };

test("server telemetry preserves error tracking, privacy and request failure behavior", async (t) => {
  const names = ["NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "NEXT_PUBLIC_POSTHOG_HOST", "NEXT_PUBLIC_POSTHOG_ENABLED", "NEXT_RUNTIME"] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  let batches: CapturedEvent[] = [];
  let attempts = 0;
  let transport: "ok" | "reject" | "hang" = "ok";
  let holdRequest: (() => Promise<void>) | undefined;
  const requests: CapturedEvent[][] = [];
  const signals: AbortSignal[] = [];
  t.mock.method(PostHog.prototype, "fetch", async (...[, options]: Parameters<PostHog["fetch"]>) => {
    attempts++;
    if (options.signal) signals.push(options.signal);
    const body = typeof options.body === "string" ? options.body : gunzipSync(Buffer.from(options.body as Uint8Array)).toString();
    const events = JSON.parse(body).batch as CapturedEvent[];
    requests.push(events);
    if (transport === "reject") throw new Error("Synthetic transport failure");
    if (transport === "hang") return new Promise<Response>(() => {});
    if (holdRequest) await holdRequest();
    batches.push(...events);
    return new Response("", { status: 200 });
  });

  try {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://telemetry.example.test";
    delete process.env.NEXT_PUBLIC_POSTHOG_ENABLED;

    await t.test("missing, disabled and unsafe configuration sends nothing", async () => {
      delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
      await reportServerException(new Error("Missing configuration"));
      process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_synthetic_server_test_only";
      process.env.NEXT_PUBLIC_POSTHOG_ENABLED = "false";
      await reportServerException(new Error("Disabled telemetry"));
      delete process.env.NEXT_PUBLIC_POSTHOG_ENABLED;
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "http://telemetry.example.test";
      await reportServerException(new Error("Unsafe endpoint"));
      assert.equal(attempts, 0);
      process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://telemetry.example.test";
    });

    await t.test("one failure produces one native error with anonymous identity and application context", async () => {
      await reportServerException(new Error("Synthetic request failure for person@example.test"), {
        source: "server-check", operation: "render", headers: { authorization: "private-header-value" }, body: "private-body-value",
      });
      assert.equal(attempts, 1);
      assert.deepEqual(batches.map((event) => event.event), ["$exception"]);
      assert.match(batches[0].distinct_id ?? "", /^hackuniverse-server-/);
      assert.equal(typeof batches[0].properties.exception_id, "string");
      for (const event of batches) {
        assert.equal(event.properties.app_name, "hackuniverse-web");
        assert.equal(event.properties.event_prefix, "hackuniverse-");
        assert.equal(event.properties.runtime, "server");
        assert.equal(event.properties.source, "server-check");
      }
      assert.ok(Array.isArray(batches.find((event) => event.event === "$exception")?.properties.$exception_list));
      const serialized = JSON.stringify(batches);
      for (const value of ["person@example.test", "private-header-value", "private-body-value", "context_line", "pre_context", "post_context"]) assert.ok(!serialized.includes(value));
    });

    await t.test("the same error object is not reported twice; another occurrence remains observable", async () => {
      const error = new Error("Repeated observer delivery");
      const before = attempts;
      await Promise.all([reportServerException(error), reportServerException(error)]);
      assert.equal(attempts - before, 1);
      await reportServerException(new Error("Repeated observer delivery"));
      assert.equal(attempts - before, 2);
    });

    await t.test("overlapping exception builders share one request without duplicating native events", async () => {
      const before = requests.length;
      await Promise.all(Array.from({ length: 6 }, (_, index) => reportServerException(new Error(`Concurrent failure ${index}`))));
      const concurrent = requests.slice(before);
      assert.equal(concurrent.length, 1);
      assert.equal(concurrent[0].length, 6);
      assert.ok(concurrent[0].every((event) => event.event === "$exception" && Array.isArray(event.properties.$exception_list)));
      assert.equal(new Set(concurrent[0].map((event) => event.properties.exception_id)).size, 6);
    });

    await t.test("an exception arriving during an in-flight flush is sent before its caller completes", async () => {
      const before = requests.length;
      let entered!: () => void;
      let release!: () => void;
      const requestStarted = new Promise<void>((resolve) => { entered = resolve; });
      const released = new Promise<void>((resolve) => { release = resolve; });
      holdRequest = () => {
        entered();
        return released;
      };
      try {
        const first = reportServerException(new Error("First in-flight exception"));
        await requestStarted;
        const second = reportServerException(new Error("Exception during in-flight flush"));
        release();
        await Promise.all([first, second]);
        const sent = requests.slice(before);
        assert.equal(sent.length, 2);
        assert.deepEqual(sent.map((batch) => batch.length), [1, 1]);
        assert.equal(new Set(sent.flat().map((event) => event.properties.exception_id)).size, 2);
        assert.ok(sent.flat().every((event) => event.event === "$exception"));
      } finally {
        release();
        holdRequest = undefined;
      }
    });

    await t.test("the Node request hook allowlists metadata and strips unrelated query/header data", async () => {
      batches = [];
      process.env.NEXT_RUNTIME = "nodejs";
      await onRequestError(Object.assign(new Error("Synthetic server hook failure"), { digest: "synthetic-digest" }), {
        path: "/design?lang=pt-BR&search=private-search-value#private-fragment",
        method: "GET",
        headers: { authorization: "private-hook-authorization", cookie: "private-hook-cookie" },
      }, {
        routerKind: "App Router", routePath: "/design", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined,
      });
      assert.equal(batches.length, 1);
      for (const event of batches) {
        assert.equal(event.properties.source, "next-request");
        assert.equal(event.properties.path, "/design?lang=pt-BR");
        assert.equal(event.properties.digest, "synthetic-digest");
        assert.equal(event.properties.route, "/design");
        assert.equal(event.properties.method, "GET");
      }
      const serialized = JSON.stringify(batches);
      for (const value of ["private-search-value", "private-fragment", "private-hook-authorization", "private-hook-cookie"]) assert.ok(!serialized.includes(value));
    });

    await t.test("malformed and unsupported request paths cannot suppress a native exception", async () => {
      process.env.NEXT_RUNTIME = "nodejs";
      for (const path of ["http://[", "javascript:private-path-value"]) {
        const before = batches.length;
        await onRequestError(new Error("Synthetic malformed request path"), { path, method: "GET", headers: {} }, {
          routerKind: "App Router", routePath: "/example", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined,
        });
        assert.equal(batches.length - before, 1);
        const event = batches.at(-1)!;
        assert.equal(event.event, "$exception");
        assert.ok(Array.isArray(event.properties.$exception_list));
        assert.equal(event.properties.source, "next-request");
        assert.ok(!JSON.stringify(event).includes(path));
        assert.ok(!JSON.stringify(event).includes("private-path-value"));
      }
    });

    await t.test("the current Node integration does not load reporting in Edge", async () => {
      const before = attempts;
      process.env.NEXT_RUNTIME = "edge";
      await onRequestError(new Error("Synthetic Edge request"), { path: "/", method: "GET", headers: {} }, {
        routerKind: "App Router", routePath: "/", routeType: "render", renderSource: "server-rendering", revalidateReason: undefined,
      });
      assert.equal(attempts, before);
    });

    await t.test("transport rejection cannot change the request failure or create retry storms", async () => {
      const before = attempts;
      transport = "reject";
      await assert.doesNotReject(reportServerException(new Error("Synthetic disconnected dependency")));
      assert.equal(attempts - before, 1);
      transport = "ok";
      const delivered = batches.length;
      await reportServerException(new Error("Recovery after disconnected dependency"));
      assert.equal(attempts - before, 2);
      assert.equal(batches.length - delivered, 2);
      assert.ok(batches.slice(delivered).every((event) => event.event === "$exception"));
      assert.equal(new Set(batches.slice(delivered).map((event) => event.properties.exception_id)).size, 2);
    });

    await t.test("a transport ignoring AbortSignal is still bounded and receives cancellation", async () => {
      const before = attempts;
      transport = "hang";
      const started = performance.now();
      await reportServerException(new Error("Synthetic stalled dependency"));
      assert.ok(performance.now() - started < 2500);
      assert.equal(attempts - before, 1);
      assert.ok(signals.at(-1)?.aborted);
      transport = "ok";
      const delivered = batches.length;
      await reportServerException(new Error("Recovery after stalled dependency"));
      assert.equal(attempts - before, 2);
      assert.equal(batches.length - delivered, 2);
      assert.equal(new Set(batches.slice(delivered).map((event) => event.properties.exception_id)).size, 2);
    });

    await t.test("the reporting deadline also bounds a stalled SDK flush and permits later recovery", async () => {
      const before = attempts;
      const stalledFlush = t.mock.method(PostHog.prototype, "flush", () => new Promise<void>(() => {}));
      const started = performance.now();
      try {
        await assert.doesNotReject(reportServerException(new Error("Synthetic stalled SDK flush")));
        const elapsed = performance.now() - started;
        assert.ok(elapsed >= 1900 && elapsed < 2500);
        assert.equal(attempts, before);
      } finally {
        stalledFlush.mock.restore();
      }
      const delivered = batches.length;
      await reportServerException(new Error("Recovery after stalled SDK flush"));
      assert.equal(attempts - before, 1);
      assert.equal(batches.length - delivered, 2);
      assert.ok(batches.slice(delivered).every((event) => event.event === "$exception"));
    });
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
  }
});
