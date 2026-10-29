import { NextResponse } from "next/server";
import { localeFromSearchParams } from "@/i18n/config";
import { designSystemUrl } from "@/modules/design-system";

/** Redirect before rendering the application shell or its first-visit intro. */
export function GET(request: Request) {
  const locale = localeFromSearchParams(new URL(request.url).searchParams);
  return NextResponse.redirect(designSystemUrl(locale));
}
