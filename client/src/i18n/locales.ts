/**
 * The public site's languages (specs/014). English is unprefixed; Filipino and
 * Bikol live under `/fil` and `/bcl`, which the middleware strips and rewrites
 * to the English route with an `x-locale` header — no route is duplicated.
 *
 * Pure: imported by the middleware (edge), server components and client
 * components alike.
 */
import review from './review.json' with { type: 'json' };
import { isProtectedRoute } from '../lib/protected-routes.ts';

export const LOCALES = ['en', 'fil', 'bcl'] as const;
export type Locale = (typeof LOCALES)[number];

/** What the switcher shows — each language in its own name. */
export const LOCALE_LABEL: Record<Locale, string> = {
  en: 'English',
  fil: 'Filipino',
  bcl: 'Bikol',
};

/** BCP 47 tags for `<html lang>` and `hreflang`. */
export const LOCALE_TAG: Record<Locale, string> = {
  en: 'en',
  fil: 'fil',
  bcl: 'bcl',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return (LOCALES as readonly string[]).includes(value ?? '');
}

type Review = Partial<Record<Locale, { by: string; at: string } | null>>;

/**
 * A language is offered to the public once a city-named reviewer has signed it
 * off (`review.json`, FR-007). Dev and staging always offer it, so it can be
 * reviewed in place.
 */
export function isLiveLocale(locale: Locale, siteEnv = process.env.NEXT_PUBLIC_SITE_ENV): boolean {
  if (locale === 'en') return true;
  if (siteEnv !== 'production') return true;
  return Boolean((review as Review)[locale]);
}

/** `/bcl/learn` → `{ locale: 'bcl', path: '/learn' }`; unprefixed → English. */
export function splitLocale(pathname: string): { locale: Locale; path: string } {
  const [, first, ...rest] = pathname.split('/');
  if (first !== 'en' && isLocale(first)) {
    return { locale: first, path: '/' + rest.join('/') };
  }
  return { locale: 'en', path: pathname };
}

/**
 * The same page in another language. Only site paths are prefixed: an external
 * URL, a hash or a query-only href is returned as is, and so is the staff app,
 * which is never translated.
 */
export function localizedPath(locale: Locale, href: string): string {
  if (locale === 'en' || !href.startsWith('/') || href.startsWith('//')) return href;
  const { path } = splitLocale(href);
  if (isProtectedRoute(path.split(/[?#]/)[0])) return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}
