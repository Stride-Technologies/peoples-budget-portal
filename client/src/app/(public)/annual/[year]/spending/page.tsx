import type { Metadata } from 'next';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { BarTable } from '@/components/public/editorial/bar-table';
import { BookYearTable, type BookRow } from '@/components/public/book-year-table';
import { loadSectionCycle } from '@/lib/public-section-page';
import { apiPublicGetAnnualBook, apiPublicGetAnnualObjects } from '@/lib/api';
import { compactPeso, formatPesoWhole } from '@/lib/currency-formatter';
import { fromCentavos, toCentavos } from '@/lib/version-diff';
import { amountLabelOf, sectionHref } from '@/lib/public-sections';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { LguWord } from '@/components/brand/brand-text';

interface Props {
  params: Promise<{ year: string }>;
  searchParams: Promise<{ office?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const title = `What each office spends on | Annual Budget ${year} | ${brand.placeName}`;
  const description = `Each office's ${year} budget by object of expenditure (salaries, supplies, equipment), with the two years before, and ${brand.placeName}'s debt and fixed obligations.`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/annual/${year}/spending`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

const CLASS_NAME = {
  PS: 'Personal services (salaries and benefits)',
  MOOE: 'Maintenance and other operating expenses',
  FE: 'Financial expenses',
  CO: 'Capital outlay (equipment, buildings)',
} as const;

/**
 * "What each office spends on" (specs/017 US3, US4): each office's LBP Form 2,
 * by object of expenditure, with the two years before; and the city's debt
 * (Form 5) and fixed obligations (Form 6). The overview was the spec's home for
 * the last two, but an LEP year has no overview, so they live here.
 */
export default async function SpendingPage({ params, searchParams }: Props) {
  const { year } = await params;
  const { office } = await searchParams;
  const { cycle, years } = await loadSectionCycle('annual', year, 'spending');
  const fy = cycle.fiscalYear;
  const [objects, book] = await Promise.all([
    apiPublicGetAnnualObjects(fy, office),
    cycle.annualBook?.debt ? apiPublicGetAnnualBook(fy) : Promise.resolve(null),
  ]);
  const amountHeading = amountLabelOf(cycle, 'annual');
  const chosen = objects.offices.find((o) => o.acronym === office) ?? null;

  // One office's lines, grouped by class in the order the form prints them.
  const rows: BookRow[] = [];
  for (const cls of ['PS', 'MOOE', 'FE', 'CO'] as const) {
    const lines = objects.lines.filter((l) => l.expenseClass === cls);
    if (!lines.length) continue;
    const sum = (k: 'pastYearActual' | 'currentYearTotal' | 'currentFirstSemActual' | 'currentSecondSemEstimate' | 'amount') => {
      const v = lines.filter((l) => l[k] !== null);
      return v.length ? fromCentavos(v.reduce((t, l) => t + toCentavos(l[k]), 0)) : null;
    };
    rows.push({
      id: cls,
      label: CLASS_NAME[cls],
      depth: 0,
      heading: true,
      pastYearActual: sum('pastYearActual'),
      currentYearTotal: sum('currentYearTotal'),
      currentFirstSemActual: sum('currentFirstSemActual'),
      currentSecondSemEstimate: sum('currentSecondSemEstimate'),
      amount: sum('amount'),
    });
    for (const l of lines) rows.push({ ...l, label: l.title ?? l.printedCode ?? '—', depth: 1, code: l.printedCode });
  }

  const loans = book?.indebtedness ?? [];
  const obligations = book?.obligations ?? [];
  const ps = (label: RegExp) => book?.printedTotals.find((t) => t.kind === 'PS_LIMIT' && label.test(t.label))?.amount;
  const psMax = ps(/Maximum/i);
  const psEst = ps(/Estimated/i);

  return (
    <>
      <SectionChrome kind="annual" cycle={cycle} years={years} tab="spending" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">LBP Form 2</p>
        <h2 className="mt-3 font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
          What each office spends on
        </h2>
        <p className="mt-6 max-w-prose text-lg text-ink-muted">
          Every office&apos;s budget, by what it buys: salaries, supplies, utilities, equipment. Pick an office to
          see its lines beside what it spent two years before and expects to spend this year.
        </p>

        {chosen ? (
          <section aria-labelledby="office" className="mt-12">
            <p className="text-sm">
              <Link href={sectionHref('annual', fy, 'spending')} className="text-ink-muted underline decoration-rule underline-offset-4 hover:text-ink">
                All offices
              </Link>
            </p>
            <h3 id="office" className="mt-4 font-display text-xl font-medium text-ink">
              {chosen.name} ({chosen.acronym})
            </h3>
            <p className="mb-5 mt-2 text-ink-muted">
              {compactPeso(chosen.total)} in {fy}, over {chosen.lines} {chosen.lines === 1 ? 'line' : 'lines'}.
            </p>
            <BookYearTable caption={`${chosen.name}, by object, ${fy}`} fiscalYear={fy} amountHeading={amountHeading} rows={rows} />
          </section>
        ) : (
          <section aria-labelledby="offices" className="mt-12">
            <h3 id="offices" className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
              By office
            </h3>
            <ul className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              {objects.offices.map((o) => (
                <li key={o.acronym} className="flex items-baseline justify-between gap-3 border-b border-rule/60 py-2">
                  <Link
                    href={`${sectionHref('annual', fy, 'spending')}?office=${encodeURIComponent(o.acronym)}`}
                    className="min-w-0 truncate text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
                    title={o.name}
                  >
                    {o.name}
                  </Link>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-ink-muted">{compactPeso(o.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {(loans.length > 0 || obligations.length > 0) && (
          <section aria-labelledby="debt" className="mt-16 border-t border-rule pt-10">
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">LBP Forms 5 and 6</p>
            <h3 id="debt" className="mt-3 font-display text-[clamp(1.25rem,1rem+1vw,1.75rem)] font-medium text-ink">
              Debt and fixed obligations
            </h3>
            <p className="mt-4 max-w-prose text-ink-muted">
              What the <LguWord k="lgu" /> must pay before anything else: its loans, and the obligations the law or a contract
              sets.
            </p>

            {loans.length > 0 && (
              <BarTable
                caption={`Loans, ${fy}: balance of principal`}
                amountHeading="Balance owed"
                countHeading={`Due in ${fy}`}
                rows={loans.map((l) => ({
                  label: l.creditor,
                  sublabel: l.purpose,
                  amount: l.balance ?? l.principal,
                  meta: compactPeso(
                    fromCentavos(toCentavos(l.budgetYearPrincipal) + toCentavos(l.budgetYearInterest)),
                  ),
                }))}
              />
            )}

            {obligations.length > 0 && (
              <table className="mt-10 w-full max-w-3xl text-sm">
                <caption className="mb-2 text-left font-medium text-ink">Statutory and contractual obligations, {fy}</caption>
                <tbody>
                  {obligations.map((o, i) => (
                    <tr key={o.id} className="border-b border-rule/60">
                      <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink">
                        {(i === 0 || obligations[i - 1].section !== o.section) && (
                          <span className="block pt-3 font-mono text-[0.625rem] uppercase tracking-[0.12em] text-ink-faint">
                            {o.section.toLowerCase()}
                          </span>
                        )}
                        {o.particulars}
                      </th>
                      <td className="whitespace-nowrap py-1.5 pl-4 text-right align-bottom font-mono tabular-nums text-ink">
                        {formatPesoWhole(o.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {psMax && psEst && (
              <p className="mt-8 max-w-prose text-sm text-ink-muted">
                Salaries and benefits are capped by law at 45% of the <LguWord k="lgu" />&apos;s regular income. The book puts this
                year&apos;s at {compactPeso(psEst)}, against a ceiling of {compactPeso(psMax)}.
              </p>
            )}
          </section>
        )}
      </div>
    </>
  );
}
