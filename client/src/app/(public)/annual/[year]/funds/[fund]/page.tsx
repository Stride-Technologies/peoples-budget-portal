import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { BarTable } from '@/components/public/editorial/bar-table';
import { loadSectionCycle } from '@/lib/public-section-page';
import {
  apiPublicGetFundRule,
  apiPublicGetRegistry,
  type PublicFundRule,
  type PublicProgramItem,
} from '@/lib/api';
import { compactPeso, formatPeso, spokenPeso } from '@/lib/currency-formatter';
import { fromCentavos, toCentavos } from '@/lib/version-diff';
import { FUND_SOURCES, SPECIAL_FUNDS } from '@/lib/schemas';
import { amountLabelOf, isLepYear, sectionHref } from '@/lib/public-sections';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';

interface Props {
  params: Promise<{ year: string; fund: string }>;
}

/** Same ceiling as Browse: every row of the fund, in one request. */
const REGISTRY_FETCH_LIMIT = 1000;

/** What a rule's minimum is a share of, in plain words. */
const BASE_WORDS: Record<NonNullable<PublicFundRule['minimumBase']>, string> = {
  NTA: "the LGU's National Tax Allotment from the national government",
  REGULAR_REVENUE: "the LGU's estimated revenue from regular sources",
  TOTAL_APPROPRIATION: 'the whole budget',
};

function fundOf(param: string): { code: string; name: string } | null {
  const code = param.toUpperCase();
  if (!SPECIAL_FUNDS.includes(code)) return null;
  return { code, name: FUND_SOURCES.find((f) => f.value === code)?.description ?? code };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year, fund: param } = await params;
  const fund = fundOf(param);
  const brand = await getBrand();
  const title = `${fund?.name ?? 'Fund'} | Annual Budget ${year} | ${brand.placeName}`;
  const description = `What the ${fund?.name ?? 'fund'} is, the law behind it, and every programme, project and activity it pays for in ${brand.placeName}'s ${year} Annual Budget.`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/annual/${year}/funds/${param.toLowerCase()}`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/**
 * One special fund's page (specs/016 US3): what it is, the law behind it, and
 * its rows grouped by the office accountable for each. The rows are the
 * registry's own fund filter, so this page and Browse cannot disagree.
 *
 * The rule check is advisory: the law sets a floor as a share of a base (NTA,
 * regular revenue), and the base arrives with spec 017's receipts. Until then
 * the page states the rule and says it cannot check it yet.
 */
export default async function FundPage({ params }: Props) {
  const { year, fund: param } = await params;
  const fund = fundOf(param);
  if (!fund) notFound();
  const { cycle, years } = await loadSectionCycle('annual', year);
  const fy = cycle.fiscalYear;

  const [rule, registry] = await Promise.all([
    apiPublicGetFundRule(fund.code, fy).catch((err: { statusCode?: number }) => {
      if (err.statusCode === 404) return null;
      throw err;
    }),
    apiPublicGetRegistry({
      cycleId: cycle.id,
      section: 'annual',
      fundSources: [fund.code],
      limit: REGISTRY_FETCH_LIMIT,
    }),
  ]);

  // ponytail: a row counts in full when any of its PPAs is charged to the fund.
  // Every special-fund row the city's book prints is wholly that fund; a row
  // that mixed funds would need the per-PPA split here.
  const byOffice = new Map<string, { label: string; sublabel?: string; rows: PublicProgramItem[]; c: number }>();
  for (const item of registry.items) {
    const key = item.office?.id ?? 'none';
    const group = byOffice.get(key) ?? {
      label: item.office?.acronym ?? 'No office',
      sublabel: item.office?.name,
      rows: [],
      c: 0,
    };
    group.rows.push(item);
    group.c += toCentavos(item.proposedTotal);
    byOffice.set(key, group);
  }
  const offices = [...byOffice.values()].sort((a, b) => b.c - a.c || a.label.localeCompare(b.label));
  const total = registry.totalBudget;
  // A historical LEP year's figures were proposed, not appropriated (specs/017).
  const amountHeading = amountLabelOf(cycle, 'annual');
  const budgetName = isLepYear(cycle) ? `${fy} proposed budget` : `${fy} Annual Budget`;
  const count = registry.items.length;

  return (
    <>
      <SectionChrome kind="annual" cycle={cycle} years={years} tab="browse" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          Special fund · {fund.code}
        </p>
        <h2 className="mt-3 font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
          {fund.name}
        </h2>

        <p className="mt-6 max-w-prose text-lg text-ink-muted">
          {count === 0 ? (
            <>No programme, project or activity in the {budgetName} is charged to this fund.</>
          ) : (
            <>
              <strong className="font-semibold text-ink" aria-label={spokenPeso(total)}>
                {compactPeso(total)}
              </strong>{' '}
              of the {budgetName} is charged to this fund, across {count}{' '}
              {count === 1 ? 'programme, project or activity' : 'programmes, projects and activities'} under{' '}
              {offices.length} {offices.length === 1 ? 'office' : 'offices'}. Each sits under the office
              that answers for it.
            </>
          )}
        </p>

        {rule && (
          <section aria-labelledby="fund-law" className="mt-12 max-w-prose border-l-2 border-rule pl-5">
            <h3 id="fund-law" className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
              What the law says
            </h3>
            <p className="mt-3 text-ink">{rule.description}</p>
            {rule.legalBasis && <p className="mt-2 text-sm text-ink-muted">Legal basis: {rule.legalBasis}</p>}
            {rule.minimumPercent && rule.minimumBase && (
              <p className="mt-4 text-sm text-ink-muted">
                This page cannot check that {Number(rule.minimumPercent)}% floor yet: {BASE_WORDS[rule.minimumBase]}{' '}
                is not on this site. When it is, the check will be a guide, not a verdict.
              </p>
            )}
          </section>
        )}

        {offices.length > 0 && (
          <section aria-labelledby="fund-offices" className="mt-14">
            <h3 id="fund-offices" className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
              By office
            </h3>
            <BarTable
              caption={`${fund.name}, Annual Budget ${fy}, by office`}
              amountHeading={amountHeading}
              countHeading="Entries"
              rows={offices.map((o, i) => ({
                label: o.label,
                sublabel: o.sublabel,
                amount: fromCentavos(o.c),
                meta: o.rows.length === 1 ? '1 entry' : `${o.rows.length} entries`,
                highlight: i === 0,
              }))}
            />

            <div className="mt-14 space-y-10">
              {offices.map((o) => (
                <table key={o.label} className="w-full text-sm">
                  <caption className="mb-2 text-left font-medium text-ink">
                    {o.sublabel ? `${o.sublabel} (${o.label})` : o.label}
                  </caption>
                  <thead className="sr-only">
                    <tr>
                      <th scope="col">Entry</th>
                      <th scope="col">{amountHeading}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-rule border-y border-rule">
                    {o.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="py-2 pr-4">
                          <Link
                            href={`/budget/${row.id}`}
                            className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
                          >
                            {row.name}
                          </Link>
                          {row.aipReferenceCode && (
                            <span className="ml-2 font-mono text-xs text-ink-faint">{row.aipReferenceCode}</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2 text-right font-mono tabular-nums text-ink">
                          {formatPeso(row.proposedTotal ?? '0')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
          </section>
        )}

        <p className="mt-14 text-sm text-ink-muted">
          <Link
            href={sectionHref('annual', fy, 'browse')}
            className="underline decoration-rule underline-offset-4 hover:text-ink"
          >
            Browse the whole {fy} Annual Budget
          </Link>
          {SPECIAL_FUNDS.filter((f) => f !== fund.code).map((other) => (
            <span key={other}>
              {' · '}
              <Link
                href={`/annual/${fy}/funds/${other.toLowerCase()}`}
                className="underline decoration-rule underline-offset-4 hover:text-ink"
              >
                {FUND_SOURCES.find((f) => f.value === other)?.description ?? other}
              </Link>
            </span>
          ))}
        </p>
      </div>
    </>
  );
}
