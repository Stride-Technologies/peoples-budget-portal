import { getSession } from '@/lib/session';
import { apiGetEventsTicket, eventsStreamUrl } from '@/lib/api';

// Same-origin SSE proxy. The browser opens an EventSource against this route;
// here we mint a short-lived stream ticket with the server-held access token
// and pipe the upstream API stream straight back. Keeps the token and the API
// URL server-side and avoids cross-origin EventSource entirely.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return new Response('Unauthorized', { status: 401 });

  let ticket: string;
  try {
    ({ ticket } = await apiGetEventsTicket(session.accessToken));
  } catch {
    return new Response('Failed to issue stream ticket', { status: 502 });
  }

  const upstream = await fetch(eventsStreamUrl(ticket), {
    headers: { Accept: 'text/event-stream' },
    // Aborts the upstream stream when the browser closes its EventSource.
    signal: request.signal,
  });
  if (!upstream.ok || !upstream.body) {
    return new Response('Upstream stream unavailable', { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
