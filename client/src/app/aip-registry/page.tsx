import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { loadAipCycles } from './_actions';
import { resolvePpa, type PpaKind } from './_resolve';
import { queryString } from './_query';
import { REGISTRY_FILTER_COOKIE, parseRegistryFilters } from '@/lib/filter-cookie';
import { registryPath } from '@/lib/registry-paths';

const LINK_PARAMS = ['program', 'open', 'kind', 'mode'];

/**
 * `/aip-registry` has no page of its own: the registry lives under its fiscal
 * year (`/aip-registry/<year>/…`, lib/registry-paths.ts). Sends the visitor to
 * the year they last looked at, else the open cycle, else the newest — so a
 * closed-out FY cannot strand them when the remembered cycle is gone.
 *
 * Older links are translated on the way: `?program=<id>` and `?open=<id>&kind=…&mode=view|edit` open that PPA's own path.
 * `mode=create` stays a query param — a create drawer has no URL of its own.
 */
export default async function AipRegistryIndex({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const one = (key: string) => (typeof params[key] === 'string' ? (params[key] as string) : undefined);
  const program = one('program');
  const mode = one('mode');

  const linkId = program ?? (mode === 'view' || mode === 'edit' ? one('open') : undefined);
  if (linkId) {
    const kind = (program ? 'program' : (one('kind') ?? 'program')) as PpaKind;
    const resolved = await resolvePpa(kind, linkId);
    if (resolved) {
      redirect(
        registryPath(resolved.year, { ...resolved.target, edit: !program && mode === 'edit' }) +
          queryString(params, LINK_PARAMS),
      );
    }
  }

  const cyclesResult = await loadAipCycles();
  const cycles = Array.isArray(cyclesResult) ? cyclesResult : [];
  const saved = parseRegistryFilters((await cookies()).get(REGISTRY_FILTER_COOKIE)?.value);
  const cycle =
    cycles.find((c) => c.id === saved.cycleId) ??
    cycles.find((c) => c.status === 'OPEN') ??
    cycles[0];
  if (!cycle) {
    return <p className="mx-auto max-w-7xl px-4 py-8 text-sm text-slate-600">No AIP cycles yet.</p>;
  }
  // An unresolvable link (deleted id, no access) lands on the year page without it.
  redirect(registryPath(cycle.fiscalYear) + queryString(params, linkId ? LINK_PARAMS : []));
}
