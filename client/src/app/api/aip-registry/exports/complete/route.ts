import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { lengthHeader } from '@/lib/download-length';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const cycleId = url.searchParams.get('cycleId');
  if (!cycleId) {
    return NextResponse.json(
      { error: 'cycleId is required.' },
      { status: 400 },
    );
  }

  const target = new URL(`${API_URL}/aip-registry/exports/complete`);
  target.searchParams.set('cycleId', cycleId);

  const response = await fetch(target, {
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const payload = await response
      .json()
      .catch(() => ({ message: 'Failed to export workbook.' }));
    const message = Array.isArray(payload.message)
      ? payload.message.join('; ')
      : payload.message;
    return NextResponse.json(
      { error: message ?? 'Failed to export workbook.' },
      { status: response.status },
    );
  }

  // Streamed straight through rather than buffered: the browser can then show
  // real download progress, and a growing export never has to sit whole in this
  // process's memory on its way past. Its size goes in X-Content-Length (Next
  // strips Content-Length here): without it the client has no denominator and
  // can only spin.
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        'attachment; filename="aip-complete-export.xlsx"',
      ...lengthHeader(response.headers),
      'Cache-Control': 'no-store',
    },
  });
}
