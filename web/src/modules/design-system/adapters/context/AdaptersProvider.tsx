"use client";

import type { ReactNode } from "react";
import type { DesignSystemAdapters } from "../types";
import { AdaptersContext } from "./AdaptersContext";

export function AdaptersProvider({ adapters, children }: { adapters: DesignSystemAdapters; children: ReactNode }) {
  return <AdaptersContext value={adapters}>{children}</AdaptersContext>;
}
