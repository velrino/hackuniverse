import type { Instrumentation } from "next";

/** The current web application uses Node; never load the Node SDK in an Edge bundle. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ reportServerException }, { sanitizeUrl }] = await Promise.all([
      import("./lib/telemetry/server"),
      import("./lib/telemetry/shared"),
    ]);
    const url = new URL(sanitizeUrl(request.path));
    const digest = error !== null && typeof error === "object" && "digest" in error && typeof error.digest === "string" ? error.digest : undefined;
    await reportServerException(error, {
      source: "next-request",
      path: `${url.pathname}${url.search}`,
      method: request.method,
      route: context.routePath,
      route_type: context.routeType,
      router_kind: context.routerKind,
      render_source: context.renderSource,
      ...(digest ? { digest } : {}),
    });
  } catch {
    // Preserve the original Next.js response when telemetry is unavailable.
  }
};
