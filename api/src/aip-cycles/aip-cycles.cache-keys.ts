/**
 * Cache keys for AIP-cycle reads. Shared so that writes outside AIPCyclesService
 * — notably budget-ceiling writes, which feed `findOne`'s embedded `ceilings`
 * and the list's `_count.ceilings` — invalidate the same entries.
 */
export const AIP_CYCLE_LIST_KEY = 'aip-cycles:list';
export const aipCycleKey = (id: string): string => `aip-cycles:one:${id}`;
