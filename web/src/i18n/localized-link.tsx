"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { withLocale } from "./config";
import { useI18n } from "./provider";

type LocalizedLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
};

/** Root-relative application links preserve the current locale. */
export function LocalizedLink({ href, ...props }: LocalizedLinkProps) {
  const { locale } = useI18n();
  return <Link href={withLocale(href, locale)} {...props} />;
}
