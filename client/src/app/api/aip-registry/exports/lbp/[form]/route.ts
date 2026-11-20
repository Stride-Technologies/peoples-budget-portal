import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

/** LBP Forms 4 and 7 (specs/008): the same proxy, one API route each. */
const FORMS = new Set(['lbp-form-4', 'lbp-form-7']);
/** Only these are forwarded — nothing else of the caller's query reaches the API. */
const PARAMS = ['cycleId', 'officeId', 'fund', 'figures', 'documentId'] as const;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ form: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const { form } = await params;
  if (!FORMS.has(form)) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  const url = new URL(request.url);
  if (!url.searchParams.get('cycleId')) {
    return NextResponse.json(
      { error: 'cycleId is required.' },
      { status: 400 },
    );
  }
  const target = new URL(`${API_URL}/aip-registry/exports/${form}`);
  for (const name of PARAMS) {
    const value = url.searchParams.get(name);
    if (value) target.searchParams.set(name, value);
  }

  const response = await fetch(target, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
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

  // Streamed through with its length, as the other export proxies do.
  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type':
        response.headers.get('content-type') ??
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        response.headers.get('content-disposition') ??
        `attachment; filename="${form}.xlsx"`,
      ...(response.headers.get('content-length')
        ? { 'Content-Length': response.headers.get('content-length')! }
        : {}),
      'Cache-Control': 'no-store',
    },
  });
}
