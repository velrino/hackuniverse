"use client";

import type { ComponentProps } from "react";
import { useI18n } from "@/i18n";
import { designSystemUrl } from "./design-system-url";

export function DesignSystemLink(props: Omit<ComponentProps<"a">, "href" | "target" | "rel">) {
  const { locale } = useI18n();
  return <a {...props} href={designSystemUrl(locale)} target="_blank" rel="noopener noreferrer" />;
}
