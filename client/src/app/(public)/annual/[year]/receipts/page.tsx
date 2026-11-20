import type { Metadata } from 'next';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { BarTable } from '@/components/public/editorial/bar-table';
import { BookYearTable, type BookRow } from '@/components/public/book-year-table';
import { loadSectionCycle } from '@/lib/public-section-page';
import { apiPublicGetAnnualBook, type PublicReceiptLine } from '@/lib/api';
import { compactPeso, spokenPeso } from '@/lib/currency-formatter';
import { fromCentavos, toCentavos } from '@/lib/version-diff';
import { isLepYear } from '@/lib/public-sections';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { LguWord } from '@/components/brand/brand-text';

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const title = `Where the money comes from | Annual Budget ${year} | ${brand.placeName}`;
  const description = `${brand.placeName}'s ${year} income as its budget book prints it: taxes, fees, the National Tax Allotment and its enterprises, with the two years before.`;
  return {
    title,
    description,
    alternates: { canonical: canonical(`/annual/${year}/receipts`) },
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/** A line's budget-year figure, or the sum of its rows when it prints none. */
function effective(line: PublicReceiptLine, kids: Map<string, PublicReceiptLine[]>): number {
  if (line.amount !== null) return toCentavos(line.amount);
  return (kids.get(line.id) ?? []).reduce((t, c) => t + effective(c, kids), 0);
}

/**
 * "Where the money comes from" (specs/017 US2): the Receipts Program as the
 * book prints it. The General Fund's program is the whole budget's income; each
 * economic enterprise's own sheet restates its part, so it is shown apart and
 * never added in.
 */
export default async function ReceiptsPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('annual', year, 'receipts');
  const fy = cycle.fiscalYear;
  const book = await apiPublicGetAnnualBook(fy);

  const general = book.receipts.filter((r) => r.officeAcronym === null);
  const kids = new Map<string, PublicReceiptLine[]>();
  for (const r of general) if (r.parentId) kids.set(r.parentId, [...(kids.get(r.parentId) ?? []), r]);
  const tops = general.filter((r) => !r.parentId);
  const total = tops.reduce((t, r) => t + effective(r, kids), 0);

  // The sources, one level down where a top line is a heading (Local Sources →
  // Tax Revenue, Non-Tax Revenue), so the bars name what a resident recognises.
  const sources = tops.flatMap((t) => kids.get(t.id) ?? [t]).filter((s) => effective(s, kids) !== 0);
  const nta = general.find((r) => r.accountCode === '4-01-06-010' || /National Tax Allotment|\bNTA\b|Internal Revenue Allotment/i.test(r.particulars));
  const ntaShare = nta && total ? Math.round((effective(nta, kids) / total) * 100) : null;

  const depthOf = new Map<string, number>();
  const rows: BookRow[] = general.map((r) => {
    const depth = r.parentId ? (depthOf.get(r.parentId) ?? 0) + 1 : 0;
    depthOf.set(r.id, depth);
    return {
      ...r,
      label: r.particulars,
      depth,
      code: r.printedCode,
      tag: r.incomeClass === 'NON_RECURRING' ? 'one-off' : null,
      heading: kids.has(r.id),
    };
  });

  const enterprises = new Map<string, { name: string; lines: PublicReceiptLine[] }>();
  for (const r of book.receipts)
    if (r.officeAcronym) {
      const e = enterprises.get(r.officeAcronym) ?? { name: r.officeName ?? r.officeAcronym, lines: [] };
      e.lines.push(r);
      enterprises.set(r.officeAcronym, e);
    }
  const proposed = isLepYear(cycle);

  return (
    <>
      <SectionChrome kind="annual" cycle={cycle} years={years} tab="receipts" />
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">Receipts Program</p>
        <h2 className="mt-3 font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-medium leading-tight tracking-[-0.02em] text-ink">
          Where the money comes from
        </h2>
        <p className="mt-6 max-w-prose text-lg text-ink-muted">
          <strong className="font-semibold text-ink" aria-label={spokenPeso(fromCentavos(total))}>
            {compactPeso(fromCentavos(total))}
          </strong>{' '}
          {proposed ? 'was expected' : 'is expected'} to be available for the {fy} budget.
          {ntaShare !== null && (
            <>
              {' '}
              {ntaShare}% of it is the <LguWord k="lgu" />&apos;s share of national taxes, the National Tax Allotment; most of
              the rest is taxes and fees the <LguWord k="lgu" /> collects itself.
            </>
          )}
        </p>

        <section aria-labelledby="sources" className="mt-12">
          <h3 id="sources" className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
            By source
          </h3>
          <BarTable
            caption={`Income by source, Annual Budget ${fy}`}
            amountHeading={`${fy} estimate`}
            countHeading="Share"
            rows={sources.map((s, i) => ({
              label: s.particulars,
              amount: fromCentavos(effective(s, kids)),
              meta: total ? `${Math.round((effective(s, kids) / total) * 100)}%` : undefined,
              highlight: i === 0,
            }))}
          />
        </section>

        <section aria-labelledby="program" className="mt-14">
          <h3 id="program" className="mb-2 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
            The Receipts Program, line by line
          </h3>
          <p className="mb-5 max-w-prose text-sm text-ink-muted">
            As the budget book prints it, with the two years before. A heading&apos;s figure is the sum of the
            lines under it. &ldquo;One-off&rdquo; marks income the <LguWord k="lgu" /> does not expect every year.
          </p>
          {/* Income is estimated, never appropriated: the budget-year column is the book's own word. */}
          <BookYearTable caption={`Receipts Program, ${fy}`} fiscalYear={fy} amountHeading="budget year" rows={rows} />
        </section>

        {enterprises.size > 0 && (
          <section aria-labelledby="enterprises" className="mt-14">
            <h3 id="enterprises" className="mb-2 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
              The <LguWord k="lgu" />&apos;s enterprises
            </h3>
            <p className="mb-5 max-w-prose text-sm text-ink-muted">
              The hospital, the market, the abattoir, the bus terminal and the college each keep their own
              receipts. Their income is already counted above; what they also receive is a subsidy from the
              rest of the budget.
            </p>
            <BarTable
              caption={`Economic enterprises' own receipts, ${fy}`}
              amountHeading={`${fy} total`}
              countHeading="Subsidy"
              rows={[...enterprises.entries()].map(([acronym, e]) => {
                const ek = new Map<string, PublicReceiptLine[]>();
                for (const l of e.lines) if (l.parentId) ek.set(l.parentId, [...(ek.get(l.parentId) ?? []), l]);
                const top = e.lines.filter((l) => !l.parentId);
                const sum = top.reduce((t, l) => t + effective(l, ek), 0);
                const subsidy = top
                  .filter((l) => /SUBSIDY FROM/i.test(l.particulars))
                  .reduce((t, l) => t + toCentavos(l.amount), 0);
                return {
                  label: acronym,
                  sublabel: e.name,
                  amount: fromCentavos(sum),
                  meta: subsidy ? compactPeso(fromCentavos(subsidy)) : '—',
                };
              })}
            />
          </section>
        )}
      </div>
    </>
  );
}
