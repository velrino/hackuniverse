import { initializeClientTelemetry } from "./lib/telemetry/client";

// Synchronous setup runs before hydration on every entry route, including error pages.
initializeClientTelemetry();
