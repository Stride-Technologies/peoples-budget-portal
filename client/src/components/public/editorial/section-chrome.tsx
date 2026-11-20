import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { getT } from '@/i18n/server';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  SECTION_LABEL,
  sectionHref,
  tabsFor,
  type PublicSection,
  type SectionTab,
} from '@/lib/public-sections';
import type { PublicCycleRecord } from '@/lib/api';
import { BrandText } from '@/components/brand/brand-text';
import { getBrand } from '@/lib/brand-server';

/**
 * The masthead every page in a budget section shares: what document you are
 * reading, which year, and the three ways to read it.
 *
 * Both rows are plain links with `aria-current`, not a JS tab widget. They are
 * different documents at different URLs — a real navigation, which should be
 * shareable, back-buttonable and crawlable.
 */
export async function SectionChrome({
  kind,
  cycle,
  years,
  tab,
  outline,
  notice,
}: {
  kind: PublicSection;
  cycle: PublicCycleRecord;
  years: number[];
  tab: SectionTab;
  /** A page-level notice under the title — the AIP reading guide's banner (specs/013). */
  notice?: ReactNode;
  /**
   * The page's outline drawer, on pages long enough to need one. It sits beside
   * the tabs because it *is* navigation, and its trigger names the section you
   * are in — so it reads as a position indicator even before you open it.
   */
  outline?: ReactNode;
}) {
  const t = await getT();
  const { budgetArchive } = await getBrand();
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pb-0 pt-10 sm:pt-14">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          <BrandText field="government" />
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] font-medium leading-tight tracking-[-0.03em] text-ink">
          {SECTION_LABEL[kind]}{' '}
          <span className="tabular-nums">{cycle.fiscalYear}</span>
          {/* A historical year known only by the Mayor's proposal (specs/017
              D25): a small tag, no banner. */}
          {kind === 'annual' && cycle.annualDocumentKind === 'LEP' && (
            <>{' '}<abbr
              title={t('section.lepTag')}
              className="ml-2 inline-block -translate-y-1 rounded border border-rule px-1.5 py-0.5 align-middle font-mono text-xs font-medium tracking-normal text-ink-muted no-underline"
            >
              LEP
            </abbr></>
          )}
        </h1>
        <OtherDocument kind={kind} cycle={cycle} />
        {notice}

        {/* Year selector — visible from day one, even at one year, so the
            archive link beside it is discoverable. */}
        <nav aria-label={t('section.fiscalYear')} className="mt-7">
          <ul className="flex flex-wrap items-center gap-2">
            {years.map((year) => {
              const isCurrent = year === cycle.fiscalYear;
              return (
                <li key={year}>
                  <Link
                    href={sectionHref(kind, year, tab)}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-[1.75rem] items-center rounded-full px-3 py-1 font-mono text-xs tabular-nums transition-colors',
                      isCurrent
                        ? 'bg-ink text-paper'
                        : 'border border-rule text-ink-muted hover:border-ink/30 hover:text-ink',
                    )}
                  >
                    {year}
                  </Link>
                </li>
              );
            })}
            {/* The LGU's own archive of older budgets, when it has one. */}
            {kind === 'annual' && budgetArchive && (
              <li>
                <a
                  href={budgetArchive.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[1.75rem] items-center gap-1 rounded-full px-3 py-1 text-xs text-ink-muted underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                >
                  {t('section.archivePdfs', { from: budgetArchive.from, to: Math.min(...years) - 1 })}
                  <ArrowUpRight aria-hidden="true" className="size-3" />
                </a>
              </li>
            )}
          </ul>
        </nav>

        <nav aria-label={`${SECTION_LABEL[kind]} ${cycle.fiscalYear}`} className="mt-8">
          <ul className="-mb-px flex gap-7">
            {/* An Overview switched off for this year is not offered at all. */}
            {tabsFor(cycle, kind).map((tabId) => {
              const isCurrent = tabId === tab;
              return (
                <li key={tabId}>
                  <Link
                    href={sectionHref(kind, cycle.fiscalYear, tabId)}
                    aria-current={isCurrent ? 'page' : undefined}
                    className={cn(
                      'inline-flex min-h-[2.25rem] items-center border-b-2 text-sm transition-colors',
                      isCurrent
                        ? 'border-ink font-medium text-ink'
                        : 'border-transparent text-ink-muted hover:border-rule hover:text-ink',
                    )}
                  >
                    {t(`section.tab.${tabId}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Pins itself to the viewport, so it is rendered here only for placement
          in the tree — it is not laid out inside the header. */}
      {outline}
    </header>
  );
}

/**
 * A year can be in both sections once its budget is enacted (specs/012): the
 * proposal stays readable, and each document points to the other so a visitor
 * can follow the plan into the law and back.
 */
async function OtherDocument({
  kind,
  cycle,
}: {
  kind: PublicSection;
  cycle: PublicCycleRecord;
}) {
  const other =
    kind === 'aip' && cycle.sections.includes('annual')
      ? 'annual'
      : kind === 'annual' && cycle.sections.includes('aip')
        ? 'aip'
        : null;
  if (!other) return null;
  const t = await getT();
  const fy = cycle.fiscalYear;
  const href = sectionHref(other, cycle.fiscalYear, tabsFor(cycle, other)[0]);
  return (
    <p className="mt-4 max-w-prose text-sm text-ink-muted">
      {other === 'annual' ? t('section.other.enacted', { fy }) : t('section.other.isEnacted', { fy })}{' '}
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
      >
        {other === 'annual' ? t('section.other.enactedLink', { fy }) : t('section.other.isEnactedLink')}
        <ArrowUpRight aria-hidden="true" className="size-3" />
      </Link>
    </p>
  );
}
