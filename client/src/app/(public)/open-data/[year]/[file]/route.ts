import { visitorIp } from '@/lib/visitor-ip';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

/**
 * The public download URL for a year's open data, `/open-data/<year>/<lgu>-budget-<year>.zip`
 * (the year's default document) or `<lgu>-budget-<year>-<aip|annual>.zip` (one document); the API names the file for the LGU.
 * One stable same-origin URL on every environment (Azure's API host differs
 * from the site's), streamed from the API's bundle route. The visitor's IP is
 * forwarded so the API's 60-a-minute limit counts the visitor, not this
 * container. A closed or unknown year is the API's 404, passed through.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ year: string; file: string }> },
) {
  const { year, file } = await params;
  const match = /^[a-z0-9-]+-budget-(\d{4})(?:-(aip|annual))?\.zip$/.exec(file);
  if (!/^\d{4}$/.test(year) || match?.[1] !== year) {
    return new Response('Not found', { status: 404 });
  }
  const document = match[2] ? `?document=${match[2]}` : '';

  const ip = await visitorIp();
  const ifNoneMatch = request.headers.get('if-none-match');
  const response = await fetch(`${API_URL}/open-data/cycles/${year}/bundle.zip${document}`, {
    headers: {
      ...(ip ? { 'X-Real-IP': ip } : {}),
      ...(ifNoneMatch ? { 'If-None-Match': ifNoneMatch } : {}),
    },
    cache: 'no-store',
  });

  const headers = new Headers();
  for (const name of [
    'content-type',
    'content-disposition',
    'content-length',
    'etag',
    'cache-control',
  ]) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.body, { status: response.status, headers });
}
