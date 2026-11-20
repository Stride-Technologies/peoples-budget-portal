import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Proxies the Annual Budget .docx export, injecting the bearer token.
 *
 * Mirrors the cluster-workbook proxy beside it: the browser cannot hold the
 * access token, so the download has to round-trip through a route handler.
 * `officeId` is optional — omitting it exports the whole book.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const cycleId = url.searchParams.get('cycleId');
  const officeId = url.searchParams.get('officeId');
  if (!cycleId) {
    return NextResponse.json(
      { error: 'cycleId is required.' },
      { status: 400 },
    );
  }

  const target = new URL(`${API_URL}/aip-registry/exports/annual-budget`);
  target.searchParams.set('cycleId', cycleId);
  if (officeId) target.searchParams.set('officeId', officeId);

  const response = await fetch(target, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ message: 'Failed to export the Annual Budget.' }));
    const message = Array.isArray(payload.message)
      ? payload.message.join('; ')
      : payload.message;
    return NextResponse.json(
      { error: message ?? 'Failed to export the Annual Budget.' },
      { status: response.status },
    );
  }

  // Streamed straight through rather than buffered: the browser can then show
  // real download progress, and a growing export never has to sit whole in this
  // process's memory on its way past. Content-Length is forwarded for the same
  // reason — without it the client has no denominator and can only spin.
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('content-type') ?? DOCX,
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        'attachment; filename="annual-budget.docx"',
      ...(response.headers.get('content-length')
        ? { 'Content-Length': response.headers.get('content-length')! }
        : {}),
      'Cache-Control': 'no-store',
    },
  });
}
