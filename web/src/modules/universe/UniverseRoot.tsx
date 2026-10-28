"use client";

import { AdaptersProvider } from "./adapters/context/AdaptersProvider";
import type { UniverseAdapters } from "./adapters/types";
import { Explorer } from "./features/explorer/Explorer";
import "./ui/layout/universe.css";

export function UniverseRoot({ adapters }: { adapters: UniverseAdapters }) {
  return <AdaptersProvider adapters={adapters}><Explorer /></AdaptersProvider>;
}
