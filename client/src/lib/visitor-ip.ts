import 'server-only';
import { headers } from 'next/headers';

/**
 * The visitor's IP as the edge saw it: nginx sets `X-Real-IP` in production;
 * Azure Container Apps only sends `X-Forwarded-For`, whose first entry is the
 * visitor. Forwarded to the API so its rate limits key on the visitor, not on
 * this container.
 */
export async function visitorIp(): Promise<string | null> {
  const h = await headers();
  return (
    h.get('x-real-ip') ??
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    null
  );
}
