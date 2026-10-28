import type { ReactNode } from "react";
import { AdaptersContext } from "./AdaptersContext";
import type { UniverseAdapters } from "../types";

export function AdaptersProvider({ adapters, children }: { adapters: UniverseAdapters; children: ReactNode }) {
  return <AdaptersContext value={adapters}>{children}</AdaptersContext>;
}
