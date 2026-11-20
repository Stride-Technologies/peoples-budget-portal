/**
 * The staff app: every route that needs a signed-in user. The middleware sends a
 * visitor without a session on these to /login; **everything else is public**
 * and goes straight to Next, which renders the page or a real 404.
 *
 * Listing the protected side rather than the public one means a new public page
 * works with no edit here (the old public allow-list sent logged-out visitors to
 * /login three times), and an unknown URL answers 404 instead of a 307 to /login
 * that search engines indexed (#90). The trade-off: a new top-level *staff* route
 * must be added here — `protected-routes.test.ts` fails until it is. Its API
 * calls need a token either way, so a missed one shows an empty page, not data.
 */
export const PROTECTED_PREFIXES = [
  '/dashboard',
  '/aip-registry',
  '/programs',
  '/projects',
  '/activities',
  '/finish-lines',
  '/ppmp-registry',
  '/budget-cycles',
  '/control-panel',
  '/account',
  // The client's own route handlers (program fetch, SSE, xlsx exports): they
  // read the session cookie, so they need the token refresh below too.
  '/api',
] as const;

/**
 * Route handlers under `/api` that anonymous visitors use (the Data Explorer's
 * xlsx export, specs/018). They read no session, so a login redirect would
 * only break the download.
 */
export const PUBLIC_API_PREFIXES = ['/api/explore', '/api/og'] as const;

export function isProtectedRoute(pathname: string): boolean {
  if (PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) return false;
  return PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
}
