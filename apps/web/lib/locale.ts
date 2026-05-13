export const defaultLocale = "zh-CN";
export const locales = [defaultLocale] as const;

const appOrigin = "http://openexam.local";

export function withDefaultLocalePath(value: string) {
  const text = value.trim() || "/";

  if (!text.startsWith("/") || text.startsWith("//") || text.includes("\\")) {
    return `/${defaultLocale}` as `/${string}`;
  }

  try {
    const parsed = new URL(text, appOrigin);

    if (parsed.origin !== appOrigin) {
      return `/${defaultLocale}` as `/${string}`;
    }

    if (locales.some((locale) => parsed.pathname === `/${locale}` || parsed.pathname.startsWith(`/${locale}/`))) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}` as `/${string}`;
    }

    const pathname = parsed.pathname === "/" ? `/${defaultLocale}` : `/${defaultLocale}${parsed.pathname}`;

    return `${pathname}${parsed.search}${parsed.hash}` as `/${string}`;
  } catch {
    return `/${defaultLocale}` as `/${string}`;
  }
}
