import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const cycleId = url.searchParams.get('cycleId');
  const clusterId = url.searchParams.get('clusterId');
  if (!cycleId) {
    return NextResponse.json(
      { error: 'cycleId is required.' },
      { status: 400 },
    );
  }

  const target = new URL(`${API_URL}/aip-registry/exports/cluster`);
  target.searchParams.set('cycleId', cycleId);
  if (clusterId) {
    target.searchParams.set('clusterId', clusterId);
  }

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
  // process's memory on its way past. Content-Length is forwarded for the same
  // reason — without it the client has no denominator and can only spin.
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        'attachment; filename="aip-cluster-export.xlsx"',
      ...(response.headers.get('content-length')
        ? { 'Content-Length': response.headers.get('content-length')! }
        : {}),
      'Cache-Control': 'no-store',
    },
  });
}
