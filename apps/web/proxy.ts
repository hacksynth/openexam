import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, locales } from "./lib/locale";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isBypassedPath(pathname)) {
    return NextResponse.next();
  }

  const locale = locales.find((item) => pathname === `/${item}` || pathname.startsWith(`/${item}/`));

  if (locale) {
    const rewritten = request.nextUrl.clone();
    rewritten.pathname = pathname === `/${locale}` ? "/" : pathname.slice(locale.length + 1);

    return NextResponse.rewrite(rewritten);
  }

  const redirected = request.nextUrl.clone();
  redirected.pathname = pathname === "/" ? `/${defaultLocale}` : `/${defaultLocale}${pathname}`;

  return NextResponse.redirect(redirected);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)"]
};

function isBypassedPath(pathname: string) {
  return pathname.startsWith("/_next") || pathname.startsWith("/api") || pathname.includes(".");
}
