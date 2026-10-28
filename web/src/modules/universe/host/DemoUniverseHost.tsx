"use client";

import { mockCatalog } from "../adapters/catalog";
import { UniverseHost } from "./UniverseHost";

/** The bundled demo is one source selection, outside the reusable host. */
export function DemoUniverseHost() {
  return <UniverseHost catalog={mockCatalog} />;
}
