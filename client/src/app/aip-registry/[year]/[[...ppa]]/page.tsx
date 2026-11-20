import { redirect } from 'next/navigation';
import { resolvePpa } from '../../_resolve';
import { queryString } from '../../_query';
import { parseRegistrySegments, registryPath } from '@/lib/registry-paths';

/**
 * Renders nothing: the registry and its drawers are the `[year]` layout, which
 * reads this path on the client. Here only the path is checked — a malformed one
 * falls back to the year, and a PPA under the wrong year or program is corrected,
 * not 404'd (same as /ppmp/<year>/plan/<id>).
 */
export default async function AipRegistryPpaPath({
  params,
  searchParams,
}: {
  params: Promise<{ year: string; ppa?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { year, ppa = [] } = await params;
  const target = parseRegistrySegments(ppa);
  if (target === undefined) redirect(registryPath(year) + queryString(await searchParams));
  if (target) {
    const resolved = await resolvePpa(target.paId ? 'project' : 'program', target.paId ?? target.programId);
    if (resolved && (String(resolved.year) !== year || resolved.target.programId !== target.programId)) {
      redirect(
        registryPath(resolved.year, { ...resolved.target, edit: target.edit }) +
          queryString(await searchParams),
      );
    }
  }
  return null;
}
