// Fail-safe: treat as non-prod unless NEXT_PUBLIC_SITE_ENV is exactly 'production'.
// Unknown / unset → locked-down behavior, not open. This is intentional (D3).
export const SITE_ENV = process.env.NEXT_PUBLIC_SITE_ENV ?? '';
export const isProd = SITE_ENV === 'production';
