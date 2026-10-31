import { NextResponse, type NextRequest } from "next/server";
import {
  localeFromSearchParams,
  localeFromAcceptLanguage,
  localeRequestHeader,
} from "./i18n/config";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Never trust the internal header; an explicit query overrides the browser.
  requestHeaders.set(
    localeRequestHeader,
    localeFromSearchParams(request.nextUrl.searchParams, localeFromAcceptLanguage(request.headers.get("accept-language"))),
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/|api(?:/|$)|brand/|favicon.ico$|icon.png$|robots.txt$|sitemap.xml$).*)",
  ],
};
