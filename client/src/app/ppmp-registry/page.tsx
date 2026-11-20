import { cookies } from 'next/headers';
import PpmpRegistryClient from './_registry-client';
import { loadOffices, loadAipCycles } from './_actions';
import {
  PPMP_REGISTRY_FILTER_COOKIE,
  parsePpmpRegistryFilters,
} from '@/lib/ppmp-filter-cookie';

/**
 * Server shell for the PPMP registry — mirrors `aip-registry/page.tsx`'s
 * pattern: read the remembered-filters cookie before the client renders, so
 * the first paint already has the right tab/office/density, and resolve the
 * default cycle here so the list fetch can fire on first render instead of
 * waiting for a client-side cycle-list round trip first.
 */
export default async function PpmpRegistryPage() {
  const store = await cookies();
  const initialFilters = parsePpmpRegistryFilters(
    store.get(PPMP_REGISTRY_FILTER_COOKIE)?.value,
  );

  const [officesResult, cyclesResult] = await Promise.all([
    loadOffices(),
    loadAipCycles(),
  ]);

  const offices = Array.isArray(officesResult) ? officesResult : [];
  const cycles = Array.isArray(cyclesResult) ? cyclesResult : [];

  const initialCycleId =
    cycles.find((c) => c.id === initialFilters.cycleId)?.id ??
    cycles.find((c) => c.status === 'OPEN')?.id ??
    cycles[0]?.id;

  return (
    <PpmpRegistryClient
      initialFilters={initialFilters}
      initialOffices={offices}
      initialCycles={cycles}
      initialCycleId={initialCycleId}
    />
  );
}
