import type { RegistryTab } from '@/lib/api'

/**
 * The AIP registry's remembered filters, in a cookie.
 *
 * A cookie rather than `localStorage` so the **server** can read it: the registry
 * page reads it during render and seeds the client with the right tab and chips,
 * instead of painting the unfiltered list and correcting itself in an effect.
 *
 * View preferences only — never anything sensitive. The value is readable by any
 * script on the origin, travels on every same-site request, and is shared by
 * everyone using the browser profile.
 */
export const REGISTRY_FILTER_COOKIE = 'pbp.aip-registry.filters'

/** A year. Filters are a long-lived preference, not a session detail. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export const REGISTRY_TABS: RegistryTab[] = [
  'ALL',
  'DRAFTS',
  'REVISIONS',
  'PUBLISHED',
  'ARCHIVED',
]
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number]

/**
 * `page` is deliberately not remembered: returning to page 5 of a list you have
 * not seen, whose contents may have changed, is disorienting in a way a
 * remembered tab is not. `view` and `officeId` are not here either — they live in
 * the URL, so they are already shareable and already survive a reload.
 */
export interface RegistryFilters {
  tab: RegistryTab
  /** Empty means "no preference" — the caller picks the open cycle. */
  cycleId: string
  clusterId: string
  officeId: string
  finishLineIds: string[]
  thematicTagIds: string[]
  search: string
  showBreakdown: boolean
  pageSize: PageSize
}

export const DEFAULT_REGISTRY_FILTERS: RegistryFilters = {
  tab: 'ALL',
  cycleId: '',
  clusterId: 'all',
  officeId: 'all',
  finishLineIds: [],
  thematicTagIds: [],
  search: '',
  showBreakdown: true,
  pageSize: 10,
}

/**
 * Filters for a registry visit that opens one row by link (`?open=`, `?program=`):
 * the drawer finds its row in the loaded list, so remembered narrowing filters
 * would hide it. Keeps only the cycle and display preferences.
 */
export function deepLinkRegistryFilters(saved: RegistryFilters): RegistryFilters {
  return {
    ...DEFAULT_REGISTRY_FILTERS,
    cycleId: saved.cycleId,
    showBreakdown: saved.showBreakdown,
    pageSize: saved.pageSize,
  }
}

/**
 * Parse a raw cookie value into filters, falling back per field.
 *
 * Every field is checked: the cookie is user-writable, survives deploys, and
 * outlives the option sets it references. Anything unrecognized silently reverts
 * to its default rather than being handed to the query — a bogus tab or page size
 * would otherwise reach the API as-is.
 *
 * Ids (cycle, cluster, office, finish lines) can only be checked for *shape*
 * here; whether they still exist is known once the option lists load, which the
 * page resolves by deriving from options rather than trusting these.
 */
export function parseRegistryFilters(raw: string | undefined | null): RegistryFilters {
  if (!raw) return DEFAULT_REGISTRY_FILTERS

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return DEFAULT_REGISTRY_FILTERS
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_REGISTRY_FILTERS
  }

  const saved = parsed as Record<string, unknown>
  const str = (value: unknown, fallback: string) =>
    typeof value === 'string' ? value : fallback

  return {
    tab: REGISTRY_TABS.includes(saved.tab as RegistryTab)
      ? (saved.tab as RegistryTab)
      : DEFAULT_REGISTRY_FILTERS.tab,
    cycleId: str(saved.cycleId, DEFAULT_REGISTRY_FILTERS.cycleId),
    clusterId: str(saved.clusterId, DEFAULT_REGISTRY_FILTERS.clusterId),
    officeId: str(saved.officeId, DEFAULT_REGISTRY_FILTERS.officeId),
    finishLineIds: Array.isArray(saved.finishLineIds)
      ? saved.finishLineIds.filter((id): id is string => typeof id === 'string')
      : DEFAULT_REGISTRY_FILTERS.finishLineIds,
    thematicTagIds: Array.isArray(saved.thematicTagIds)
      ? saved.thematicTagIds.filter((id): id is string => typeof id === 'string')
      : DEFAULT_REGISTRY_FILTERS.thematicTagIds,
    search: str(saved.search, DEFAULT_REGISTRY_FILTERS.search),
    showBreakdown:
      typeof saved.showBreakdown === 'boolean'
        ? saved.showBreakdown
        : DEFAULT_REGISTRY_FILTERS.showBreakdown,
    pageSize: PAGE_SIZE_OPTIONS.includes(saved.pageSize as PageSize)
      ? (saved.pageSize as PageSize)
      : DEFAULT_REGISTRY_FILTERS.pageSize,
  }
}

/** Persist from the browser. No-op during server rendering. */
export function writeRegistryFilters(filters: RegistryFilters): void {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(JSON.stringify(filters))
  document.cookie = `${REGISTRY_FILTER_COOKIE}=${encoded}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`
}
