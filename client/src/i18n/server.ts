import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { canonical } from '@/lib/seo';
import { LOCALES, LOCALE_TAG, isLiveLocale, isLocale, localizedPath, type Locale } from './locales';
import { translator } from './t';
import { getBrand } from '@/lib/brand-server';
import { messageVars } from '@/lib/brand';

/**
 * The request's language, from the `x-locale` header the middleware sets when
 * it strips a `/fil` or `/bcl` prefix (specs/014). Anything else is English.
 */
export async function getLocale(): Promise<Locale> {
  const value = (await headers()).get('x-locale');
  return isLocale(value) ? value : 'en';
}

/**
 * `redirect()` that keeps the visitor's language: a server redirect's Location
 * is the bare path, which would drop `/bcl` (the middleware only sees the request).
 */
export async function localeRedirect(path: string): Promise<never> {
  redirect(localizedPath(await getLocale(), path));
}

/** `const t = await getT()` in a server component. */
export async function getT() {
  const locale = await getLocale();
  return translator(locale, messageVars(await getBrand(), locale));
}

/**
 * `alternates` for a page's metadata (FR-006): its canonical URL in the
 * visitor's language, and the same page in every live language for `hreflang`
 * (`x-default` is English). `path` is the unprefixed route.
 */
export async function localeAlternates(path: string) {
  const locale = await getLocale();
  const live = LOCALES.filter((l) => isLiveLocale(l));
  return {
    canonical: canonical(localizedPath(locale, path)),
    languages: {
      ...Object.fromEntries(live.map((l) => [LOCALE_TAG[l], canonical(localizedPath(l, path))])),
      'x-default': canonical(path),
    },
  };
}
