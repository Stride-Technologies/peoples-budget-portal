import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { BudgetCycleExplorer } from '@/components/public/learn/budget-cycle-explorer';
import { LearnHero, LearnSection } from '@/components/public/learn/learn-section';
import { EXAMPLE_FY, liveBudgets } from '@/lib/budget-cycle';
import { getLocale, getT, localeAlternates } from '@/i18n/server';
import { cycleCopy } from '@/i18n/budget-cycle';
import type { MessageKey } from '@/i18n/t';
import { loadPublicCycles } from '@/app/(public)/budget/_actions';
import { OG_IMAGES } from '@/lib/seo';
import { cn } from '@/lib/utils';
import { getBrand } from '@/lib/brand-server';
import { messageVars } from '@/lib/brand';



export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const title = t('learn.meta.title');
  const description = t('learn.meta.description');
  return {
    title,
    description,
    alternates: await localeAlternates('/learn'),
    openGraph: { images: OG_IMAGES, title, description },
  };
}

// Copy is in the catalogue (specs/014): `learn.deeper.<id>.*`, `learn.overlap.<id>.*`.
const GO_DEEPER = [
  { id: 'dbm', href: 'https://www.dbm.gov.ph/index.php/budget-operations-manual-for-lgus' },
  { id: 'natin', href: 'https://www.wesolve.ph/budget-natin-guidebook' },
] as const;

const OVERLAPS = ['adjust', 'review', 'report'] as const;

/** The example year's neighbours, for `{prev}` / `{fy}` / `{next}` in the copy. */
const FY = { prev: EXAMPLE_FY - 1, fy: EXAMPLE_FY, next: EXAMPLE_FY + 1 };

/** Bars on a Jan(y0) → mid(y0+2) axis, in percent of 30 months. */
const YEARS = (() => {
  const y0 = EXAMPLE_FY - 1;
  const pct = (months: number) => `${(months / 30) * 100}%`;
  return {
    axis: [
      { label: 'learn.axis.jan', year: y0, at: 0 },
      { label: 'learn.axis.jan', year: y0 + 1, at: 12 },
      { label: 'learn.axis.jan', year: y0 + 2, at: 24 },
      { label: 'learn.axis.mid', year: y0 + 2, at: 30 },
    ] satisfies { label: MessageKey; year: number; at: number }[],
    rows: [
      { fy: y0, bars: [{ kind: 'spend', from: 0, to: 18, label: 'learn.bar.spent' }] },
      {
        fy: y0 + 1,
        bars: [
          { kind: 'make', from: 2, to: 12, label: 'learn.bar.made' },
          { kind: 'spend', from: 12, to: 30, label: 'learn.bar.spent' },
        ],
      },
      { fy: y0 + 2, bars: [{ kind: 'make', from: 14, to: 24, label: 'learn.bar.made' }] },
    ] satisfies { fy: number; bars: { kind: string; from: number; to: number; label: MessageKey }[] }[],
    pct,
  };
})();

export default async function LearnPage() {
  const t = await getT();
  const brand = await getBrand();
  const { budgetArchive } = brand;
  // The LGU's own archive of older budgets comes first, when it has one.
  const deeper = [...(budgetArchive ? [{ id: 'archive' as const, href: budgetArchive.url }] : []), ...GO_DEEPER];
  const locale = await getLocale();
  const { stages } = cycleCopy(locale, messageVars(brand, locale));
  const cycles = await loadPublicCycles();
  const live = liveBudgets(Array.isArray(cycles) ? cycles : []);
  /** ", with stages 1 and 2 still under way" — the other open stages, if any. */
  const alongside = (others: readonly number[]) =>
    others.length === 0
      ? ''
      : t(others.length > 1 ? 'learn.alongside.many' : 'learn.alongside.one', {
          stages: others.join(` ${t('learn.and')} `),
        });
  return (
    <EditorialPage>
      <LearnHero eyebrow={t('learn.hero.eyebrow')} title={t('learn.hero.title')}>
        <p>{t('learn.hero.body', { count: stages.length })}</p>
      </LearnHero>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LearnSection
          first
          id="stage-by-stage"
          eyebrow={t('learn.s1.eyebrow')}
          title={t('learn.s1.title', FY)}
        >
          <div className="mt-10">
            <BudgetCycleExplorer />
          </div>
        </LearnSection>

        <LearnSection
          id="at-the-same-time"
          eyebrow={t('learn.s2.eyebrow')}
          title={t('learn.s2.title')}
          lede={t('learn.s2.lede')}
        >
          <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:grid-cols-3">
            {OVERLAPS.map((o) => (
              <li key={o} className="bg-paper-raised p-6 sm:p-7">
                <p className="font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">
                  {t(`learn.overlap.${o}.when`, FY)}
                </p>
                <h3 className="mt-3 font-display text-lg font-medium leading-snug tracking-[-0.02em] text-ink">
                  {t(`learn.overlap.${o}.title`)}
                </h3>
                <p className="mt-3 text-[0.9375rem] leading-7 text-ink-muted">
                  {t(`learn.overlap.${o}.body`, FY)}
                </p>
              </li>
            ))}
          </ul>
        </LearnSection>

        <LearnSection
          id="two-budgets"
          eyebrow={t('learn.s3.eyebrow')}
          title={t('learn.s3.title')}
          lede={
            <p>
              {t('learn.s3.lede')}
              {live.length > 0 && ` ${t('learn.s3.rightNow')} `}
              {live.map((b, i) => (
                <span key={b.fiscalYear}>
                  {i > 0 && '; '}
                  {t('learn.s3.isAt', { year: b.fiscalYear })}{' '}
                  {/* A plain anchor: same-page, it must fire `hashchange`, which
                      the explorer listens for. next/link uses pushState. */}
                  <a
                    href={`#stage-${b.stage}`}
                    className="text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
                  >
                    {t('learn.s3.stage', {
                      n: b.stage,
                      title: stages[b.stage].title.toLowerCase(),
                    })}
                  </a>
                  {alongside(b.alongside)}
                </span>
              ))}
              {live.length > 0 && '.'}
            </p>
          }
        >
          <div
            role="img"
            aria-label={t('learn.s3.aria', FY)}
            className="mt-12 max-w-4xl space-y-2.5"
          >
            <div className="grid grid-cols-[4rem_minmax(0,1fr)] gap-3 font-mono text-[0.6875rem] text-ink-faint">
              <span />
              <div className="relative h-4">
                {YEARS.axis.map((a) => (
                  <span
                    key={a.at}
                    className={cn('absolute whitespace-nowrap', a.at === 30 ? '-translate-x-full' : a.at > 0 && '-translate-x-1/2')}
                    style={{ left: YEARS.pct(a.at) }}
                  >
                    {t(a.label, { year: a.year })}
                  </span>
                ))}
              </div>
            </div>
            {YEARS.rows.map((r) => (
              <div key={r.fy} className="grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3">
                <span className="font-mono text-xs text-ink-muted">{r.fy}</span>
                <div className="relative h-8 rounded-md bg-paper-tint">
                  {r.bars.map((b) => (
                    <span
                      key={b.label + b.from}
                      className={
                        b.kind === 'make'
                          ? 'absolute inset-y-1 truncate rounded border border-[#2F6F5E] bg-[#E6F1EE] px-2 text-xs leading-[22px] text-ink'
                          : 'absolute inset-y-1 truncate rounded border border-[#8A6A1F] bg-[#F3EEDF] px-2 text-xs leading-[22px] text-ink'
                      }
                      style={{ left: YEARS.pct(b.from), width: YEARS.pct(b.to - b.from) }}
                    >
                      {t(b.label)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </LearnSection>


        <section aria-labelledby="go-deeper" className="mt-20 border-t border-rule pt-14 sm:mt-28">
          <h2 id="go-deeper" className="font-display text-2xl font-medium tracking-[-0.02em] text-ink">
            {t('learn.deeper.title')}
          </h2>
          <ul className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:grid-cols-3">
            {deeper.map((link) => (
              <li key={link.href} className="bg-paper-raised">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex h-full flex-col gap-4 p-6 transition-colors hover:bg-paper sm:p-7"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="text-sm font-medium text-ink">
                      {t(`learn.deeper.${link.id}.label`, { from: budgetArchive?.from ?? '' })}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-ink-faint transition-transform group-hover:-translate-y-0.5"
                    />
                  </span>
                  <span className="text-sm leading-6 text-ink-muted">
                    {t(`learn.deeper.${link.id}.gloss`)}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </EditorialPage>
  );
}
