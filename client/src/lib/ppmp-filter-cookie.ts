/**
 * The PPMP registry's remembered filters, in a cookie — mirrors
 * `filter-cookie.ts`'s `RegistryFilters` pattern, trimmed for PPMP: no
 * cluster/finish-line chips (PPMP has neither) and no page size (PPMP's
 * per-office/cycle row count doesn't need the AIP registry's pagination —
 * the whole filtered set is fetched and paged in memory).
 *
 * View preferences only — never anything sensitive.
 */
export const PPMP_REGISTRY_FILTER_COOKIE = 'pbp.ppmp-registry.filters'

const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export type PpmpRegistryTab = 'ALL' | 'UNPUBLISHED' | 'PUBLISHED'
export const PPMP_REGISTRY_TABS: PpmpRegistryTab[] = [
  'ALL',
  'UNPUBLISHED',
  'PUBLISHED',
]

export interface PpmpRegistryFilters {
  tab: PpmpRegistryTab
  /** Empty means "no preference" — the caller picks the open cycle. */
  cycleId: string
  officeId: string
  search: string
  showBreakdown: boolean
}

export const DEFAULT_PPMP_REGISTRY_FILTERS: PpmpRegistryFilters = {
  tab: 'ALL',
  cycleId: '',
  officeId: 'all',
  search: '',
  showBreakdown: true,
}

/**
 * Parse a raw cookie value into filters, falling back per field — the
 * cookie is user-writable and outlives the option sets it references.
 */
export function parsePpmpRegistryFilters(
  raw: string | undefined | null,
): PpmpRegistryFilters {
  if (!raw) return DEFAULT_PPMP_REGISTRY_FILTERS

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_PPMP_REGISTRY_FILTERS
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_PPMP_REGISTRY_FILTERS
  }

  const saved = parsed as Record<string, unknown>
  const str = (value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback

  return {
    tab: PPMP_REGISTRY_TABS.includes(saved.tab as PpmpRegistryTab)
      ? (saved.tab as PpmpRegistryTab)
      : DEFAULT_PPMP_REGISTRY_FILTERS.tab,
    cycleId: str(saved.cycleId, DEFAULT_PPMP_REGISTRY_FILTERS.cycleId),
    officeId: str(saved.officeId, DEFAULT_PPMP_REGISTRY_FILTERS.officeId),
    search: str(saved.search, DEFAULT_PPMP_REGISTRY_FILTERS.search),
    showBreakdown:
      typeof saved.showBreakdown === 'boolean'
        ? saved.showBreakdown
        : DEFAULT_PPMP_REGISTRY_FILTERS.showBreakdown,
  }
}

/** Persist from the browser. No-op during server rendering. */
export function writePpmpRegistryFilters(filters: PpmpRegistryFilters): void {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(JSON.stringify(filters))
  document.cookie = `${PPMP_REGISTRY_FILTER_COOKIE}=${encoded}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}
