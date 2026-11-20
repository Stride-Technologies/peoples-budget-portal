import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import AipRegistryClient from '../_registry-client';
import { loadAipCycles, loadClusters, loadFinishLines } from '../_actions';
import { REGISTRY_FILTER_COOKIE, parseRegistryFilters } from '@/lib/filter-cookie';

/**
 * The registry for one fiscal year. It is a *layout*, not a page, on purpose:
 * the open PPA lives in the child path (`[[...ppa]]`, lib/registry-paths.ts), and
 * a layout survives child-segment changes. As a page it remounted — drawer,
 * filters and list gone — whenever a server action's revalidatePath refetched the
 * tree for a `/program/<id>` URL the client had pushed.
 *
 * It reads the remembered-filters cookie before the client renders, so the first
 * paint already has the right tab, chips, and density, and fetches the three filter
 * datasets so the list request fires on first render. All three endpoints are
 * cached server-side (`ref:` / `aip-cycles:`).
 */
export default async function AipRegistryYearLayout({
  params,
  children,
}: {
  params: Promise<{ year: string }>;
  children: ReactNode;
}) {
  const { year } = await params;
  const [cyclesResult, clustersResult, finishLinesResult] = await Promise.all([
    loadAipCycles(),
    loadClusters(),
    loadFinishLines(),
  ]);
  const cycles = Array.isArray(cyclesResult) ? cyclesResult : [];
  const cycle = cycles.find((c) => String(c.fiscalYear) === year);
  if (!cycle) notFound();

  const store = await cookies();
  return (
    <>
      <AipRegistryClient
        savedFilters={parseRegistryFilters(store.get(REGISTRY_FILTER_COOKIE)?.value)}
        initialCycles={cycles}
        initialClusters={Array.isArray(clustersResult) ? clustersResult : []}
        initialFinishLines={Array.isArray(finishLinesResult) ? finishLinesResult : []}
        initialCycleId={cycle.id}
      />
      {children}
    </>
  );
}
