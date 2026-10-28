import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";
import { eventContext, readTelemetryConfiguration, sanitizeTelemetryEvent } from "./shared";

const requestTimeoutMs = 1500;
const reportingDeadlineMs = 2000;
const reportedErrors = new WeakSet<object>();
let client: PostHog | undefined;

function getClient() {
  const configuration = readTelemetryConfiguration({
    token: process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN,
    host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    enabled: process.env.NEXT_PUBLIC_POSTHOG_ENABLED,
  });
  if (!configuration) return null;
  client ??= new PostHog(configuration.token, {
    host: configuration.host,
    flushAt: 1,
    flushInterval: 0,
    maxQueueSize: 32,
    requestTimeout: requestTimeoutMs,
    fetchRetryCount: 0,
    disableGeoip: true,
    enableExceptionAutocapture: false,
    enableLocalEvaluation: false,
    before_send: (event) => sanitizeTelemetryEvent({ ...event, properties: eventContext("server", event.properties) }),
  });
  return client;
}

/** Await request-scoped reporting without changing the application's failure behavior. */
export async function reportServerException(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const posthog = getClient();
    if (!posthog) return;
    const identity = error !== null && (typeof error === "object" || typeof error === "function") ? error : null;
    if (identity && reportedErrors.has(identity)) return;
    if (identity) reportedErrors.add(identity);

    const distinctId = `hackuniverse-server-${randomUUID()}`;
    const properties = eventContext("server", { ...context, exception_id: randomUUID() });
    const summary = error instanceof Error
      ? { exception_type: error.name, exception_message: error.message }
      : { exception_type: typeof error, exception_message: typeof error === "string" ? error : "Non-Error thrown value" };
    const send = async () => {
      try {
        await Promise.allSettled([
          posthog.captureExceptionImmediate(error, distinctId, properties),
          posthog.captureImmediate({
            distinctId,
            event: "hackuniverse-exception",
            properties: { ...properties, ...summary, native_event: "$exception" },
          }),
        ]);
      } finally {
        await posthog.flush();
      }
    };
    await Promise.race([
      send(),
      new Promise<void>((resolve) => { deadline = setTimeout(resolve, reportingDeadlineMs); }),
    ]);
  } catch {
    // Reporting cannot replace the original failure or recursively report itself.
  } finally {
    if (deadline) clearTimeout(deadline);
  }
}
