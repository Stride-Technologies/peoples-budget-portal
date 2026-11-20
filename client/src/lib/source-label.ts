import type { SourceLink } from './api';

/**
 * Where an imported row came from, short enough for a table cell:
 * `ECON r305`, `p. 3 · row 7`, `table 2 row 11`. The file name is the title.
 */
export function sourceLabel(source: Pick<SourceLink, 'ref' | 'page'>): string {
  const sheetRow = /^(.+)!r(\d+)$/.exec(source.ref);
  const where = sheetRow ? `${sheetRow[1]} r${sheetRow[2]}` : source.ref;
  return [source.page ? `p. ${source.page}` : null, where || null].filter(Boolean).join(' · ');
}
