import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { isPortalPdf } from '@/lib/source-pdf';

/** The largest scan the viewer passes through (the FY2025 by-PPA files are under 5 MB). */
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * One of the LGU's posted budget PDFs, served from our origin so the source viewer can frame it
 * (such a site sends no CORS headers; our CSP frames only 'self'). Signed-in staff only, and
 * only PDFs under `NEXT_PUBLIC_SOURCE_PDF_PREFIX` (lib/source-pdf.ts), never an arbitrary URL. next.config.ts lets this one path be framed by our own pages.
 */
export async function GET(req: Request) {
  if (!(await getSession())?.accessToken) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
  const url = new URL(req.url).searchParams.get('url') ?? '';
  if (!isPortalPdf(url)) return NextResponse.json({ error: 'Not a PDF from the LGU site' }, { status: 400 });

  try {
    const res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(30_000) });
    const length = Number(res.headers.get('content-length') ?? 0);
    if (!res.ok || !res.body || !/pdf/i.test(res.headers.get('content-type') ?? '') || length > MAX_BYTES)
      return NextResponse.json({ error: 'The LGU site did not return the PDF' }, { status: 502 });
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': 'application/pdf',
        ...(length ? { 'Content-Length': String(length) } : {}),
        // isPortalPdf allows only [\w./-] in the path, so the name needs no escaping.
        'Content-Disposition': `inline; filename="${url.split('/').pop()}"`,
        // The portal's uploads never change at a URL.
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    console.error('[api/source-pdf]', err);
    return NextResponse.json({ error: 'The LGU site could not be reached' }, { status: 502 });
  }
}
