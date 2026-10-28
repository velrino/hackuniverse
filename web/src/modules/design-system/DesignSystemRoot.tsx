"use client";

import { AdaptersProvider } from "./adapters/context/AdaptersProvider";
import { useDesignSystemCopy } from "./adapters/hooks/useDesignSystemAdapters";
import type { DesignSystemAdapters } from "./adapters/types";
import { Showcase } from "./features/showcase/Showcase";
import { DesignSystemShell } from "./ui/layout/DesignSystemShell";
import { useShowcaseNavigation } from "./hooks/useShowcaseNavigation";

function DesignSystemSurface() {
  const copy = useDesignSystemCopy();
  const navigation = useShowcaseNavigation();
  return <DesignSystemShell copy={copy} {...navigation}><Showcase mode={navigation.mode} activeSection={navigation.activeSection} /></DesignSystemShell>;
}

export function DesignSystemRoot({ adapters }: { adapters: DesignSystemAdapters }) {
  return <AdaptersProvider adapters={adapters}><DesignSystemSurface /></AdaptersProvider>;
}
