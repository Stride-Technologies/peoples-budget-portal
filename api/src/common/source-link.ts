import type { Prisma } from '../generated/prisma/index';

export interface SourceLink {
  /** The city's file name. */
  file: string;
  /** Where in it: `ECON!r305` (sheet and row) or `table 2 row 11`. */
  ref: string;
  /** The page of the file, when the file has pages (a PDF). */
  page: number | null;
  /** The sheet opened at that row, or the file; null when nobody hosts it. */
  url: string | null;
}

/** Turns a row's import provenance into something staff can open or cite. */
export function sourceLink(
  doc: { name: string; url: string | null; sheetGids: Prisma.JsonValue } | null,
  ref: string | null,
  page: number | null = null,
): SourceLink | null {
  if (!doc || (!ref && page === null)) return null;
  const match = ref ? /^(.+)!r(\d+)$/.exec(ref) : null;
  const gids = (doc.sheetGids ?? {}) as Record<string, string>;
  const gid = match ? gids[match[1]] : undefined;
  return {
    file: doc.name,
    ref: ref ?? '',
    page,
    url:
      doc.url && gid
        ? `${doc.url}#gid=${gid}&range=A${match![2]}`
        : doc.url && page
          ? `${doc.url}#page=${page}`
          : doc.url,
  };
}
