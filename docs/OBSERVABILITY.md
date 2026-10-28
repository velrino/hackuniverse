# Web observability

The web app initializes PostHog synchronously from `web/src/instrumentation-client.ts`, before React hydration. It does not depend on visiting the home page or mounting a particular provider. Direct entry to `/`, `/design`, `/example`, nested routes and the not-found page uses the same initialization. The SDK owns initial and history-based pageviews, including query changes such as `lang`; hash-only section changes do not create pageviews. There is no parallel pageview effect in React.

## Configuration

Copy [the example](../web/.env.example) to `web/.env.local` and supply an ingestion token. Local environment files are ignored by Git. Configure these variables separately in Vercel Preview and Production:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Public project ingestion token, beginning with `phc_`. |
| `NEXT_PUBLIC_POSTHOG_HOST` | HTTPS ingestion host; defaults to `https://us.i.posthog.com`. |
| `NEXT_PUBLIC_POSTHOG_ENABLED` | Set to `false` to disable initialization and manual reporting. Missing token also disables reporting. |
| `NEXT_PUBLIC_APP_ENV` | Deployment environment, such as `development`, `preview` or `production`. |
| `NEXT_PUBLIC_APP_VERSION` | Optional release/build identifier. |

`NEXT_PUBLIC_` values are included in browser code. Vercel keeps the token out of Git, but cannot make a browser ingestion token private. Never use a personal or management API key. Reporting failure, missing configuration and blocked transport must not prevent application rendering, recovery or navigation.

## Events and application scope

Every event receives `app: "hackuniverse"`, `app_name: "hackuniverse-web"`, `event_prefix: "hackuniverse-"`, runtime and environment. These properties separate this app when the PostHog project is shared.

| Event | Purpose |
| --- | --- |
| `hackuniverse-pageview` | Application-scoped companion to one native pageview. |
| `hackuniverse-exception` | Application-scoped exception summary, with a correlation ID. |
| `$pageview` | Native PostHog web analytics event. |
| `$exception` | Native PostHog Error Tracking event with SDK-generated exception structure. |

Native names remain intact because PostHog depends on them. Companions do not recursively generate events. Choose either the prefixed family or the native family with an application filter when counting activity; summing both would count the same occurrence twice. A tab or anchor change on `/design` is not a pageview; changing the global language query is.

For future browser events, import the shared application API rather than the SDK:

```ts
import { captureClientException, captureEvent } from "@/lib/telemetry/client";

captureEvent("hackuniverse-import-started", { source: "import", operation: "start" });

try {
  // Perform the operation.
} catch (error) {
  captureClientException(error, { source: "import", operation: "load" });
  // Preserve the operation's own recovery behavior.
}
```

Supply code-owned diagnostic context only. The transport intentionally allowlists properties; extend that policy with focused tests when new context is needed. Do not pass provider responses, imported website content, form values, headers or bodies.

## Error coverage

- The bundled exception extension is installed before hydration, without a remote script dependency. It captures uncaught browser errors and unhandled promise rejections on every page. One global `console.error` bridge preserves normal console output and reports through the same object-identity deduplication as React boundaries, avoiding a second copy of a caught render failure. Object arguments are not serialized into log messages, and SDK-internal diagnostics are excluded.
- Root `error.tsx` and `global-error.tsx` report caught React failures. The global fallback owns its document, font and styles, and resolves EN/PT directly from the query without relying on a failed provider. Error text is generic; raw diagnostics stay out of the UI.
- Already-caught scene initialization, view, frame and flight-loading failures pass through a provider-neutral callback. The application host supplies telemetry; rendering code does not import PostHog. Normal fallback and flight recovery remain unchanged.
- `instrumentation.ts` reports Next.js Node request, render and action failures. It sends native and prefixed events before returning, with a 1.5-second request timeout, zero retries and a 2-second reporting deadline. No process-global crash handlers are installed. The current application runs on Node; the hook deliberately skips Edge.
- Explicitly reported browser error objects are deduplicated after successful capture. Server error objects are deduplicated while reporting. Another error instance remains a separate occurrence. Abort cancellations are excluded from manual client reporting.

This cannot capture failures before the instrumentation bundle executes, a terminated browser/server process, blocked analytics transport or errors deliberately swallowed elsewhere without calling the reporting API. Compiled stack frames are retained; source-map upload and release symbolication are separate work.

## Transport policy

`web/src/lib/telemetry/shared.ts` applies the same policy to automatic/manual and browser/server events. URLs retain origin/path and only a single valid `lang`; arbitrary query parameters, hashes and user information are removed. Common credential and email patterns are redacted in diagnostic strings. Request/response bodies, headers, cookies, stack variables, source context lines and person-property updates are excluded. String length, recursion depth and collection sizes are bounded. Redaction is a safeguard, not permission to attach raw private content to an exception.

Session recording, form/DOM autocapture, person-profile processing, marketing/referrer persistence, surveys, conversations, product tours and performance capture are disabled. The browser transport accepts only native pageviews/exceptions and `hackuniverse-*` application events; SDK profile events such as `$set` are blocked. Browser persistence uses an application-specific local-storage name, isolating it from other apps using the same ingestion project. PostHog may enrich accepted browser events with its normal network-derived metadata; this client policy does not change settings for other applications in the shared project.

## Validation

Run from `web/`:

```sh
npm run test:telemetry
npm run lint
npx tsc --noEmit
npm run build
```

The focused suite covers configuration, native/companion event contracts, lifecycle/deduplication, privacy, request metadata, disabled reporting and bounded transport failures without sending live events. Browser and ingestion validation are separate checks; use explicitly synthetic error messages for them. Keep diagnostic test routes and deliberate exception controls out of production source.

Reference contracts: [PostHog Next.js](https://posthog.com/docs/libraries/next-js), [exception capture](https://posthog.com/docs/error-tracking/capture), and the installed Next.js instrumentation/error-boundary documentation for the pinned version.
