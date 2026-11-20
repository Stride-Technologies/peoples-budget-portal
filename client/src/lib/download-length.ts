/**
 * A proxied file's size, carried past Next.
 *
 * Since 16.4.5 Next removes `Content-Length` from every route handler response
 * (the fix for GHSA-pc58-hwjq-p385), so a handler that streams an API file
 * through cannot tell the browser how big it is that way. The export proxies
 * send the size in `X-Content-Length` instead, and `downloadWithProgress` reads
 * it back for its percentage.
 */
export const LENGTH_HEADER = 'X-Content-Length';

/** Spread into a proxy response's headers; empty when the upstream size is unknown. */
export function lengthHeader(upstream: Headers): Record<string, string> {
  // An encoded upstream body is decoded by fetch while its Content-Length still
  // counts the encoded bytes: a wrong total is worse than none.
  if (upstream.get('content-encoding')) return {};
  const bytes = totalBytes(upstream);
  return bytes ? { [LENGTH_HEADER]: String(bytes) } : {};
}

/** The total a download can divide by, or 0 when the response states none. */
export function totalBytes(headers: Headers): number {
  for (const name of [LENGTH_HEADER, 'content-length']) {
    const bytes = Number(headers.get(name));
    if (Number.isSafeInteger(bytes) && bytes > 0) return bytes;
  }
  return 0;
}
