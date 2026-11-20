/** A page's `searchParams` back to `?a=b`, minus `omit`; '' when nothing is left. */
export function queryString(
  params: Record<string, string | string[] | undefined>,
  omit: string[] = [],
): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (omit.includes(key) || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v);
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}
