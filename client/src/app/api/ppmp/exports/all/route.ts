import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = new URL(request.url);
  const target = new URL(`${API_URL}/ppmp/exports/all`);
  for (const key of ['officeId', 'aipCycleId', 'isPublished']) {
    const value = url.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
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

  // Streamed straight through, same rationale as the AIP registry exports
  // proxy: the browser gets real download progress and this process never
  // buffers the whole file.
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        'attachment; filename="ppmp-export.xlsx"',
      ...(response.headers.get('content-length')
        ? { 'Content-Length': response.headers.get('content-length')! }
        : {}),
      'Cache-Control': 'no-store',
    },
  });
}
