import type { Metadata } from "next";

/** The site's public address (`NEXT_PUBLIC_SITE_URL`), for canonical links, the sitemap and share cards. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const SITE_NAME = "People's Budget Portal";
export const STATIC_PAGE_LAST_MODIFIED = new Date("2026-06-19T00:00:00+08:00");

/**
 * The share image (`/api/og`, 1200×630, drawn from the LGU's settings). Next replaces `openGraph`
 * wholesale per segment, so a page that sets its own `openGraph` must repeat
 * this or it ships with no image at all (#93).
 */
export const OG_IMAGES = [
  { url: "/api/og", width: 1200, height: 630, alt: SITE_NAME },
];

export function canonical(path = "/"): string {
  return new URL(path, SITE_URL).toString();
}

export const noindexMetadata: Pick<Metadata, "robots"> = {
  robots: { index: false, follow: false },
};
