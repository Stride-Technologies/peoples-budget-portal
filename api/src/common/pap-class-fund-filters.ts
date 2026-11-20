import { BadRequestException } from '@nestjs/common';
import { FundSource, PapClass, type Prisma } from '../generated/prisma/index';

/**
 * The registry's PAP class and fund source filters (#107), shared by the public
 * registry, the enacted-Ordinance registry and the staff AIP registry so the
 * three agree on what a filter matches.
 *
 * Within one filter the values are OR'd (GAS or STO); the filter as a whole is
 * one more AND'd conjunct beside the others.
 */

/** "Not recorded": no fund source on the program or on any of its PPAs. */
export const NO_FUND_SOURCE = 'NONE';
export type FundSourceFilter = FundSource | typeof NO_FUND_SOURCE;

const PAP_CLASSES = Object.values(PapClass);
const FUND_SOURCE_FILTERS: string[] = [
  ...Object.values(FundSource),
  NO_FUND_SOURCE,
];

function asList(raw: string | string[] | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const values = (Array.isArray(raw) ? raw : [raw]).filter(Boolean);
  return values.length ? [...new Set(values)] : undefined;
}

/**
 * Reject an unknown value rather than drop it, so a caller never reads a
 * narrower list as the answer to the filter they asked for. Both sets are
 * closed enums, so they also cap the array's length.
 */
export function normalizePapClasses(
  raw: string | string[] | undefined,
): PapClass[] | undefined {
  const values = asList(raw);
  const bad = values?.filter((v) => !PAP_CLASSES.includes(v as PapClass));
  if (bad?.length) {
    throw new BadRequestException(
      `Unknown PAP class: ${bad.join(', ')}. Expected one of ${PAP_CLASSES.join(', ')}.`,
    );
  }
  return values as PapClass[] | undefined;
}

export function normalizeFundSources(
  raw: string | string[] | undefined,
): FundSourceFilter[] | undefined {
  const values = asList(raw);
  const bad = values?.filter((v) => !FUND_SOURCE_FILTERS.includes(v));
  if (bad?.length) {
    throw new BadRequestException(
      `Unknown fund source: ${bad.join(', ')}. Expected one of ${FUND_SOURCE_FILTERS.join(', ')}.`,
    );
  }
  return values as FundSourceFilter[] | undefined;
}

/**
 * A program with no PAP class prints under III. Operations on the AIP form and
 * the export (schema.prisma, `enum PapClass`), so "Operations" matches it too:
 * the filter shows what the form shows.
 */
export function programPapClassWhere(
  classes: PapClass[] | undefined,
): Prisma.ProgramWhereInput | undefined {
  if (!classes?.length) return undefined;
  const where: Prisma.ProgramWhereInput = { papClass: { in: classes } };
  return classes.includes(PapClass.OPERATIONS)
    ? { OR: [where, { papClass: null }] }
    : where;
}

/**
 * A derived program leaves its own `fundSources` empty and draws on whatever
 * its PPAs draw on (schema.prisma, `Program.fundSources`), so a program matches
 * a fund when it or any of its PPAs lists it — the same reach as the thematic
 * tag filter. In 2027, 109 of the 143 programs with no fund of their own carry
 * one on a PPA; reading the program alone would hide them.
 */
export function programFundSourceWhere(
  sources: FundSourceFilter[] | undefined,
): Prisma.ProgramWhereInput | undefined {
  if (!sources?.length) return undefined;
  const funds = sources.filter((s): s is FundSource => s !== NO_FUND_SOURCE);
  const either: Prisma.ProgramWhereInput[] = [];
  if (funds.length) {
    either.push(
      { fundSources: { hasSome: funds } },
      { projectActivities: { some: { fundSources: { hasSome: funds } } } },
    );
  }
  if (sources.includes(NO_FUND_SOURCE)) {
    either.push({
      fundSources: { isEmpty: true },
      projectActivities: { every: { fundSources: { isEmpty: true } } },
    });
  }
  return { OR: either };
}

/** The enacted Ordinance's version: one fund per item, read across the tree. */
export function budgetItemPapClassWhere(
  classes: PapClass[] | undefined,
): Prisma.BudgetItemWhereInput | undefined {
  if (!classes?.length) return undefined;
  const where: Prisma.BudgetItemWhereInput = { papClass: { in: classes } };
  return classes.includes(PapClass.OPERATIONS)
    ? { OR: [where, { papClass: null }] }
    : where;
}

export function budgetItemFundSourceWhere(
  sources: FundSourceFilter[] | undefined,
): Prisma.BudgetItemWhereInput | undefined {
  if (!sources?.length) return undefined;
  const funds = sources.filter((s): s is FundSource => s !== NO_FUND_SOURCE);
  const either: Prisma.BudgetItemWhereInput[] = [];
  if (funds.length) {
    // `treeItems` includes the root itself (ordinance-registry.ts).
    either.push({ treeItems: { some: { fundSource: { in: funds } } } });
  }
  if (sources.includes(NO_FUND_SOURCE)) {
    either.push({ treeItems: { every: { fundSource: null } } });
  }
  return { OR: either };
}
