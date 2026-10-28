"use client";

import { useEffect } from "react";
import { RuntimeErrorPage, useRuntimeErrorLocale } from "@/components/errors/runtime-error";
import { captureClientException } from "@/lib/telemetry/client";

export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  const locale = useRuntimeErrorLocale();
  useEffect(() => { captureClientException(error, { source: "react-boundary" }); }, [error]);
  return <RuntimeErrorPage retry={retry} locale={locale} />;
}
