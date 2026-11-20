import { Prisma, ProgramStatus } from '../generated/prisma/index';

/**
 * A program that counts: not deleted, not archived (specs/013).
 *
 * Use this — never a bare `deletedAt: null` — wherever a query means "the live
 * programs": staff lists, totals, exports, LBP forms, ceilings, code scopes.
 * An ARCHIVED program keeps its `publishedVersionId` and its rows, so anything
 * keyed on `deletedAt` or `publishedVersionId` alone would still count it.
 */
export const LIVE_PROGRAM = {
  deletedAt: null,
  status: { not: ProgramStatus.ARCHIVED },
} satisfies Prisma.ProgramWhereInput;

/**
 * What the public can list, search, total and download (Phase 1 D13/D14).
 *
 * Keyed on `publishedVersionId`, not on PUBLISHED vs PUBLISHED_REVISION: both
 * serve the same snapshot, so no public check ever enumerates them and a
 * program mid-revision cannot slip out of the registry. ARCHIVED is the one
 * status that matters here: it keeps its published version but counts nowhere.
 *
 * Rule of thumb: "can this be written to?" reads status. "Is this public, and
 * what does the public see?" reads publishedVersionId.
 */
export const PUBLICLY_VISIBLE = {
  ...LIVE_PROGRAM,
  publishedVersionId: { not: null },
} satisfies Prisma.ProgramWhereInput;

/**
 * What the public can still *open* by its link: everything visible, plus
 * archived programs, whose page, versions and comments stay readable with an
 * "Archived" notice (specs/013 FR-016). Never use this for a list or a total.
 */
export const PUBLICLY_READABLE = {
  deletedAt: null,
  publishedVersionId: { not: null },
} satisfies Prisma.ProgramWhereInput;
