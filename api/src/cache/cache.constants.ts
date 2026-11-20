/**
 * Cache TTLs. TTLs are a safety net only — writes invalidate the relevant keys
 * explicitly (see CacheService consumers). Reference data is near-static;
 * aip-cycle data changes through status transitions during planning.
 */
export const REFERENCE_TTL_SECONDS = 3600;
export const AIP_CYCLE_TTL_SECONDS = 300;

/** Key prefix for all reference-data entries — invalidated as a group. */
export const REFERENCE_KEY_PREFIX = 'ref:';

/**
 * Public registry responses. Anonymous and identical for every visitor, so one
 * entry per filter combination serves everyone. Publishing and public feedback
 * invalidate the group explicitly; the TTL is the safety net.
 */
export const PUBLIC_REGISTRY_TTL_SECONDS = 300;
export const PUBLIC_REGISTRY_KEY_PREFIX = 'pub:registry:';

/**
 * Internal registry tab counts + budget aggregate. Keyed by visibility scope and
 * filters but **not** page — they are identical across every page flip and tab
 * click, yet were recomputed on each one. The page rows are deliberately never
 * cached: they carry a per-user `hasUnread` flag and the reader is usually the
 * editor, so they must stay live.
 *
 * Shorter TTL than the public entries because it also absorbs budget-total drift
 * from the rollup services, which do not invalidate (see RegistryCacheService).
 */
export const REGISTRY_COUNTS_TTL_SECONDS = 60;
export const REGISTRY_COUNTS_KEY_PREFIX = 'reg:counts:';
