import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { compactPeso, formatWholePesos } from '@/lib/currency-formatter';
import type { OverviewData } from '@/lib/public-overview-data';
import { sectionHref, type SectionKind } from '@/lib/public-sections';
import { goal } from '@/lib/goal-label';
import { LguWord } from '@/components/brand/brand-text';


/**
 * Written framing over live derived figures.
 *
 * Prose alone rots — it describes a snapshot of the data and stops being true.
 * Figures alone do not explain themselves. So every number on this page is read
 * from the same request the Overview uses, and the sentences around them say only
 * things that stay true as the data changes.
 */
export function Methodology({
  kind,
  fiscalYear,
  data,
}: {
  kind: SectionKind;
  fiscalYear: number;
  data: OverviewData;
}) {
  const { coverage, expenseMix, fundSourceCaveats } = data;
  const total = Number(coverage.totalProposed);
  const mixTotal = Number(expenseMix.total);
  const reconciliationGap = total - mixTotal;
  const unclassified = coverage.programCount - expenseMix.classifiedProgramCount;

  return (
    <div className="py-16 sm:py-20">
      <div className="max-w-[42rem]">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          Methodology
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink">
          Where these figures come from
        </h1>
        <p className="mt-6 text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          {kind === 'annual' ? (
            <>
              This year is a historical record. It was read out of the{' '}
              <LguWord k="lgu" />&rsquo;s printed Annual Budget and checked back against it line
              by line, so what you see here should match the book exactly — and
              where it cannot, this page says so.
            </>
          ) : (
            <>
              This year is still being assembled. Offices publish their own
              proposals as they finish them, so the figures move, and some of what
              a complete budget records has not been filled in yet. This page is
              the honest account of what is and is not here.
            </>
          )}
        </p>
      </div>

      <dl className="mt-16 space-y-12 border-t border-rule pt-12">
        <Note term="What is counted">
          <p>
            {coverage.programCount.toLocaleString('en-PH')} entries across{' '}
            {coverage.publishedOfficeCount} of {coverage.totalOfficeCount}{' '}
            <LguWord k="lguAdj" /> offices, totalling{' '}
            <strong className="font-semibold text-ink">
              ₱{formatWholePesos(coverage.totalProposed)}
            </strong>
            .{' '}
            {kind === 'aip' && coverage.publishedOfficeCount < coverage.totalOfficeCount && (
              <>
                The {coverage.totalOfficeCount - coverage.publishedOfficeCount}{' '}
                offices that have not published are absent entirely — not counted
                as zero, simply not here yet.
              </>
            )}
          </p>
          <p className="mt-3">
            Only entries an office has published are shown. Work still in draft or
            under review is deliberately invisible: publishing is the moment an
            office stands behind a figure.
          </p>
        </Note>

        <Note term="What the amount means">
          {/* A plan and a law are different kinds of number: only the enacted
              ordinance appropriates, so the AIP must never be called one. */}
          {kind === 'aip' ? (
            <p>
              Every peso figure in this section is an{' '}
              <strong className="font-semibold text-ink">estimated cost</strong> —
              what an office expects a planned program to cost. The AIP lists more
              programs than the <LguWord k="lgu" /> can afford, so it is not a budget: nothing
              may be spent on the strength of it. Nor is it the proposed budget —
              that is the Local Expenditure Program the <LguWord k="Mayor" /> submits to the{' '}
              <LguWord k="council" />, drawn from this plan. A program here may be
              funded in full, in part or not at all, and none of these figures is a
              record of money paid out.
            </p>
          ) : (
            <p>
              Every peso figure in this section is an{' '}
              <strong className="font-semibold text-ink">appropriation</strong> —
              permission to spend, granted by the ordinance the{' '}
              <LguWord k="council" /> enacted. It is not a record of money paid out. What was
              actually disbursed is answered in the <LguWord k="lgu" />&rsquo;s accountability
              reports, not here.
            </p>
          )}
          <p className="mt-3">
            Amounts are stored to the centavo and added as whole centavos, never as
            decimals, so a total is exact rather than nearly right. Figures set at
            display size are abbreviated ({compactPeso(coverage.totalProposed)}),
            and the exact value is always in the tables and on{' '}
            <Link
              href={sectionHref(kind, fiscalYear, 'browse')}
              className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              Browse
            </Link>
            .
          </p>
        </Note>

        <Note term="Where the money sits">
          <p>
            A programme&rsquo;s amount is recorded in one of two ways. Many
            programmes state their cost directly, with no projects or activities
            beneath them. The rest are broken down, and then the programme&rsquo;s
            amount is the sum of the projects and activities beneath it, which is
            where every peso is recorded. That is why a programme and its single
            child can show the same figure — they are the same money described at
            two levels, not two amounts.
          </p>
        </Note>

        {mixTotal > 0 && (
          <Note term="Personnel, operating and capital">
            <p>
              The three-way split covers{' '}
              {expenseMix.classifiedProgramCount.toLocaleString('en-PH')} of{' '}
              {coverage.programCount.toLocaleString('en-PH')} entries
              {unclassified > 0 && (
                <>
                  ; the other {unclassified.toLocaleString('en-PH')} carry a single
                  figure with no breakdown
                </>
              )}
              .
            </p>
            {Math.abs(reconciliationGap) >= 1 && (
              <p className="mt-3">
                The three classes add to{' '}
                ₱{formatWholePesos(expenseMix.total)} against a total of ₱
                {formatWholePesos(coverage.totalProposed)} — a difference of{' '}
                <strong className="font-semibold text-ink">
                  ₱{formatWholePesos(String(Math.abs(reconciliationGap)))}
                </strong>
                . That is not a rounding error. It is the money on entries that
                carry an amount without a breakdown, and it is left visible rather
                than absorbed into one of the three shares.
              </p>
            )}
          </Note>
        )}

        <Note term="Fund sources">
          {fundSourceCaveats.totalRootPAs === 0 ? (
            <p>No entries were available to check for a fund source.</p>
          ) : fundSourceCaveats.notStated === fundSourceCaveats.totalRootPAs ? (
            // All-or-nothing is the common case for an imported historical year,
            // and a three-item list of two zeros reads like a bug.
            <p>
              None of the{' '}
              {fundSourceCaveats.totalRootPAs.toLocaleString('en-PH')} entries
              records a fund. The printed budget groups its appropriations into
              sheets rather than tagging each line, so the fund is known at that
              level and not per entry — and inferring one from a sheet title would
              be a guess presented as a record.
            </p>
          ) : (
            <>
              <p>
                A fund is recorded against the entry, not the amount — so an entry
                naming two funds says nothing about how the money divides between
                them. Splitting it would be invention and counting it under both
                would inflate the total, so of{' '}
                {fundSourceCaveats.totalRootPAs.toLocaleString('en-PH')} entries:
              </p>
              <ul className="mt-3 space-y-1.5">
                <li>
                  {(
                    fundSourceCaveats.totalRootPAs -
                    fundSourceCaveats.multiple -
                    fundSourceCaveats.notStated
                  ).toLocaleString('en-PH')}{' '}
                  name exactly one fund and are counted under it.
                </li>
                <li>
                  {fundSourceCaveats.multiple.toLocaleString('en-PH')} name more
                  than one and are shown together, undivided.
                </li>
                <li>
                  {fundSourceCaveats.notStated.toLocaleString('en-PH')} name none
                  at all.
                </li>
              </ul>
            </>
          )}
        </Note>

        <Note term="The reference code">
          <p>
            Each entry carries the <LguWord k="lgu" />&rsquo;s own AIP reference code — seven
            segments naming the sector, the level of government, the type of
            office, the office itself, the section of the book, then the programme
            and the entry within it. The code numbers rows; it does not add them
            up, and it carries no year, so the same string is reissued each fiscal
            year.
          </p>
        </Note>

        {kind === 'annual' ? (
          <Note term="How this year was checked">
            <p>
              The enacted budget was read out of the <LguWord k="lgu" />&rsquo;s printed book and
              then verified against it: every entry present, worded as printed,
              filed under the right office, and reconciled to the centavo. The
              check fails loudly rather than quietly, and it is re-run after every
              change to the data.
            </p>
            <p className="mt-3">
              Names are reproduced as the book prints them, including where the
              book itself is inconsistent. A handful of entries print an amount
              with no description; they appear here as recorded rather than being
              hidden, because dropping them would make the total stop matching the
              enacted budget.
            </p>
          </Note>
        ) : (
          <Note term="What is still missing">
            <p>
              Some entries were imported from the budget office&rsquo;s workbook
              rather than typed in here, and where the import had to make a
              judgement — a {goal} the sheet implied but never stated, two
              rows that were plainly one, a heading with no row of its own — that
              decision is recorded against the entry and has to be reviewed by its
              office before it can be published.
            </p>
            <p className="mt-3">
              Anything an office has not filled in yet is simply absent. It is not
              estimated, and it is not carried over from last year.
            </p>
          </Note>
        )}

        <Note term="Corrections">
          <p>
            If a figure looks wrong, it may well be. Every entry on{' '}
            <Link
              href={sectionHref(kind, fiscalYear, 'browse')}
              className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
            >
              Browse
            </Link>{' '}
            takes public feedback, and it reaches the office that owns the entry.
            The authoritative document remains the <LguWord k="lgu" />&rsquo;s own printed budget.
          </p>
        </Note>
      </dl>
    </div>
  );
}

/** One term and its explanation — shared with the PPMP Methodology page. */
export function Note({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-10">
      <dt className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
        {term}
      </dt>
      <dd className="mt-3 max-w-[38rem] text-[0.9375rem] leading-7 text-ink-muted sm:mt-0">
        {children}
      </dd>
    </div>
  );
}
