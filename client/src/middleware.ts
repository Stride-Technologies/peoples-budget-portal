import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isProtectedRoute } from '@/lib/protected-routes';
import { isLiveLocale, splitLocale } from '@/i18n/locales';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';
// NODE_ENV drives secure-cookie flag; NEXT_PUBLIC_SITE_ENV drives discoverability gating.
const IS_NODE_PROD = process.env.NODE_ENV === 'production';
const IS_SITE_PROD = process.env.NEXT_PUBLIC_SITE_ENV === 'production';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function jwtExp(token: string): number | null {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64)) as { exp?: number };
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

function isExpired(token: string): boolean {
  const exp = jwtExp(token);
  return exp === null || exp * 1000 < Date.now();
}

async function callRefresh(
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string } | null> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ accessToken: string; refreshToken: string }>;
  } catch {
    return null;
  }
}

function clearAndRedirect(request: NextRequest) {
  const res = NextResponse.redirect(new URL('/login', request.url));
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  return res;
}

// Add X-Robots-Tag: noindex on every non-prod response so crawlers and AI
// scrapers that ignore robots.txt still see the noindex signal (D4).
function withNoindex(res: NextResponse): NextResponse {
  if (!IS_SITE_PROD) res.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return res;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets pass through immediately (also excluded by the matcher below,
  // but kept as a fast-path safety net).
  if (/\.(png|jpe?g|gif|svg|ico|webp|woff2?|ttf|otf|eot)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // ── Non-prod: HTTP Basic Auth gate (D5, D6) ──────────────────────────────
  // Active when NEXT_PUBLIC_SITE_ENV !== 'production' AND credentials are set.
  // If credentials are not configured (e.g. local dev without the vars), the
  // gate is skipped — you still get noindex, but no auth challenge.
  if (!IS_SITE_PROD) {
    const user = process.env.PREVIEW_BASIC_AUTH_USER;
    const pass = process.env.PREVIEW_BASIC_AUTH_PASS;

    if (user && pass) {
      const authHeader = request.headers.get('authorization') ?? '';
      let authed = false;

      if (authHeader.startsWith('Basic ')) {
        const decoded = atob(authHeader.slice(6));
        const colonIdx = decoded.indexOf(':');
        if (colonIdx !== -1) {
          authed =
            decoded.slice(0, colonIdx) === user &&
            decoded.slice(colonIdx + 1) === pass;
        }
      }

      if (!authed) {
        return new Response('Unauthorized', {
          status: 401,
          headers: {
            'WWW-Authenticate': 'Basic realm="Preview Environment", charset="UTF-8"',
          },
        });
      }
    }
  }

  // ── Language prefix (specs/014): /fil/learn and /bcl/learn are /learn ─────
  // Strip the prefix, rewrite to the English route and tell the page which
  // language it is in (`x-locale`, read by `getLocale`). The staff app is
  // English-only, and a language not yet signed off is not offered in
  // production, so those send the visitor to the unprefixed page. Every rule
  // below then runs on the stripped path, so `/fil/aip-registry` can never
  // slip past the staff check.
  const { locale, path } = splitLocale(pathname);
  if (locale !== 'en') {
    const url = request.nextUrl.clone();
    url.pathname = path;
    if (!isLiveLocale(locale) || isProtectedRoute(path)) {
      // Middleware needs an absolute Location; nextUrl carries the real host.
      return withNoindex(NextResponse.redirect(url));
    }
    const forwarded = new Headers(request.headers);
    forwarded.set('x-locale', locale);
    return withNoindex(NextResponse.rewrite(url, { request: { headers: forwarded } }));
  }

  // ── Everything outside the staff app is public: the page, or a real 404 ──
  if (!isProtectedRoute(pathname)) {
    // Only the prefix decides a public page's language; a client-sent x-locale
    // does not. (Staff routes pass it through: it can only mislabel the sender's
    // own English page, so it is not stripped on every branch below.)
    if (request.headers.has('x-locale')) {
      const cleaned = new Headers(request.headers);
      cleaned.delete('x-locale');
      return withNoindex(NextResponse.next({ request: { headers: cleaned } }));
    }
    return withNoindex(NextResponse.next());
  }

  // ── Staff app: JWT auth ───────────────────────────────────────────────────
  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    return clearAndRedirect(request);
  }

  if (accessToken && !isExpired(accessToken)) {
    return withNoindex(NextResponse.next());
  }

  const tokens = await callRefresh(refreshToken);
  if (!tokens) {
    return clearAndRedirect(request);
  }

  // Redirect to the same URL so server components receive the fresh cookies.
  const cookieOpts = {
    httpOnly: true,
    secure: IS_NODE_PROD,
    sameSite: 'lax' as const,
    path: '/',
  };
  const res = NextResponse.redirect(request.nextUrl);
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, { ...cookieOpts, maxAge: 15 * 60 });
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieOpts,
    maxAge: 7 * 24 * 60 * 60,
  });
  return withNoindex(res);
}

export const config = {
  // Match all routes except Next.js internals and static file extensions.
  // Route-level public/protected logic is handled in code via isProtectedRoute().
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:jpg|jpeg|png|gif|svg|ico|webp|woff2?|ttf|otf|txt)).*)',
  ],
};
