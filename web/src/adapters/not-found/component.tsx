"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotFoundPage } from "@/components/errors/not-found";
import { LocalizedLink, useTranslations } from "@/i18n";

export function NotFoundHost() {
  const copy = useTranslations("notFound");

  return (
    <NotFoundPage
      copy={copy}
      action={
        <Button asChild size="lg">
          <LocalizedLink href="/">
            <ArrowLeft aria-hidden="true" />
            {copy.home}
          </LocalizedLink>
        </Button>
      }
    />
  );
}
