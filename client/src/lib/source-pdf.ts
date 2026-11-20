import type { SourceLink } from './api';

/**
 * Where the LGU posts its scanned budget documents, e.g.
 * `https://www.example.gov.ph/wp-content/uploads/` (`NEXT_PUBLIC_SOURCE_PDF_PREFIX`). PDFs under it
 * are the only ones the source viewer proxies: such a site sends no CORS headers and the CSP
 * allows framing only our own origin, so a scan is shown through `/api/source-pdf` rather than
 * linked. Unset, nothing is proxied and every source stays a plain link.
 */
const PREFIX = process.env.NEXT_PUBLIC_SOURCE_PDF_PREFIX ?? '';

/**
 * True for a PDF under the configured prefix: https, that exact host and folder, no query, hash,
 * `..`, credentials or other host. `prefix` is a parameter for the tests.
 */
export function isPortalPdf(url: string, prefix = PREFIX): boolean {
  return (
    /^https:\/\/[\w.-]+\/(?:[\w.-]+\/)*$/.test(prefix) &&
    url.startsWith(prefix) &&
    /^[\w./-]+\.pdf$/i.test(url.slice(prefix.length)) &&
    !url.includes('..')
  );
}

/** The in-app viewer's frame URL for a source, opened at its page; null when it is not one of the LGU's posted PDFs. */
export function sourcePdfHref(source: Pick<SourceLink, 'url' | 'page'>, prefix = PREFIX): string | null {
  const file = source.url?.replace(/#.*$/, '');
  if (!file || !isPortalPdf(file, prefix)) return null;
  return `/api/source-pdf?url=${encodeURIComponent(file)}${source.page ? `#page=${source.page}` : ''}`;
}
