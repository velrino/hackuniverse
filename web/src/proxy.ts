import { NextResponse, type NextRequest } from "next/server";
import {
  localeFromSearchParams,
  localeRequestHeader,
} from "./i18n/config";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  // Override incoming values: only the URL may select the initial locale.
  requestHeaders.set(
    localeRequestHeader,
    localeFromSearchParams(request.nextUrl.searchParams),
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: [
    "/((?!_next/|api(?:/|$)|brand/|favicon.ico$|icon.png$|robots.txt$|sitemap.xml$).*)",
  ],
};
