"use client";

import { AdaptersProvider } from "./adapters/context/AdaptersProvider";
import { useDesignSystemCopy } from "./adapters/hooks/useDesignSystemAdapters";
import type { DesignSystemAdapters } from "./adapters/types";
import { Showcase } from "./features/showcase/Showcase";
import { DesignSystemShell } from "./ui/layout/DesignSystemShell";

function DesignSystemSurface() {
  const copy = useDesignSystemCopy();
  return <DesignSystemShell copy={copy}><Showcase /></DesignSystemShell>;
}

export function DesignSystemRoot({ adapters }: { adapters: DesignSystemAdapters }) {
  return <AdaptersProvider adapters={adapters}><DesignSystemSurface /></AdaptersProvider>;
}
