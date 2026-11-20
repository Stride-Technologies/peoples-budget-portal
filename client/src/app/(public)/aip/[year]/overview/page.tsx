import type { Metadata } from 'next';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { AipReadingGuide } from '@/components/public/aip-reading-guide';
import { aipReadingGuideFigures } from '@/lib/aip-reading-guide-copy';
import {
  SectionShell,
  sectionPlan,
  type SectionPlanEntry,
} from '@/components/public/editorial/section-shell';
import { SectionOutline } from '@/components/public/editorial/section-outline';
import { Mark } from '@/components/public/editorial/mark';
import { StatBand } from '@/components/public/editorial/stat-band';
import { ExploreThis } from '@/components/explore/explore-this';
import { BarTable } from '@/components/public/editorial/bar-table';
import { StackedBar } from '@/components/public/editorial/stacked-bar';
import { HandOff } from '@/components/public/editorial/hand-off';
import { loadSectionCycle } from '@/lib/public-section-page';
import {
  loadCycleTotal,
  loadOverview,
  priorEnactedCycle,
} from '@/lib/public-overview-data';
import { compactPeso, spokenPeso } from '@/lib/currency-formatter';
import { METHODOLOGY_PUBLIC, sectionHref } from '@/lib/public-sections';
import { OG_IMAGES } from '@/lib/seo';
import { getT, localeAlternates } from '@/i18n/server';
import { fundBucketLabels } from '@/lib/budget-overview';
import { rich } from '@/i18n/rich';
import { getBrand } from '@/lib/brand-server';

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const t = await getT();
  const description = t('aipov.meta.description', { place: brand.placeName });
  const title = t('aipov.meta.title', { year, place: brand.placeName });
  return {
    title,
    description,
    alternates: await localeAlternates(`/aip/${year}/overview`),
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/**
 * The page's sections, declared once.
 *
 * Feeds both the rendered sections and the outline drawer, so the two cannot
 * drift, and numbering comes from position — dropping the comparison section
 * renumbers the rest rather than leaving a gap at 06. Labels: `aipov.s.<id>`.
 */
const ALL_SECTIONS = [
  { id: "what-this-is", accent: "#00689D" },
  { id: "whats-in-it", accent: "#4C9F38" },
  { id: "whos-asking", accent: "#FD6925", tinted: true },
  { id: "what-it-buys", accent: "#1447E6" },
  { id: "where-it-comes-from", accent: "#A21942", tinted: true },
  { id: "vs-last-year", accent: "#DD1367", tinted: true },
] as const;

/**
 * How an office is named in running prose: full name, acronym in brackets.
 *
 * The tables can afford to lead with the acronym because the full name sits
 * directly beneath it. A sentence cannot — "One office, CEO, accounts for 51%"
 * is insider shorthand, and the reader this page is written for has no reason to
 * know that CEO is the Office of the City Engineer.
 */
function officeName(office: { label: string; sublabel?: string }): string {
  return office.sublabel ? `${office.sublabel} (${office.label})` : office.label;
}

export default async function AipOverviewPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years, cycles } = await loadSectionCycle('aip', year, 'overview');
  const data = await loadOverview(cycle, 'aip');
  const t = await getT();

  const { coverage, expenseMix } = data;
  const fy = cycle.fiscalYear;
  const officesLeft = coverage.totalOfficeCount - coverage.publishedOfficeCount;
  const totalNumber = Number(coverage.totalProposed);
  const biggestOffice = data.offices[0];
  const officeShare =
    biggestOffice && totalNumber > 0
      ? (Number(biggestOffice.amount) / totalNumber) * 100
      : 0;
  const mixTotal = Number(expenseMix.total);
  const capitalShare = mixTotal > 0 ? (Number(expenseMix.co) / mixTotal) * 100 : 0;
  const programmes = (count: number) =>
    count === 0 ? '—' : t(count === 1 ? 'aipov.programs.one' : 'aipov.programs.other', { count });

  // The largest *named* fund. The ranked list also holds two synthetic buckets —
  // "more than one fund" and "not stated" — and either can top it, which is a
  // fact for the table to show but not something the sentence can name: "comes
  // from the Fund not stated" is not a sentence.
  const leadFund = data.fundSources.find((f) => !f.key.startsWith('__')) ?? null;

  // Off unless someone has decided the proposal is far enough along to compare.
  // See AIPCycle.publicComparisonEnabled.
  const prior = priorEnactedCycle(cycles, cycle);
  const showComparison = cycle.publicComparisonEnabled && prior !== null;
  // Only fetched when the section will actually render — an extra whole-cycle
  // request is not worth making for a section nobody will see.
  const priorData = showComparison && prior ? await loadCycleTotal(prior) : null;
  const priorTotal = priorData ? Number(priorData.total) : 0;
  const changePct =
    priorTotal > 0 ? ((totalNumber - priorTotal) / priorTotal) * 100 : null;

  // Numbering follows what actually renders: with the comparison off, the
  // hand-off is 06 rather than leaving a hole where 06 used to be.
  const accentOf = (id: string) =>
    ALL_SECTIONS.find((s) => s.id === id)?.accent;

  const plan = sectionPlan(
    ALL_SECTIONS.filter((s) => s.id !== 'vs-last-year' || showComparison).map(
      (s): SectionPlanEntry => ({ ...s, label: t(`aipov.s.${s.id}`) }),
    ),
  );
  const officesOf = (
    <Mark color={accentOf('what-this-is')}>
      {t('aipov.plan.of', { n: coverage.publishedOfficeCount, total: coverage.totalOfficeCount })}
    </Mark>
  );

  return (
    <>
      <SectionChrome
        kind="aip"
        cycle={cycle}
        years={years}
        tab="overview"
        notice={
          <AipReadingGuide
            fiscalYear={fy}
            figures={aipReadingGuideFigures(cycle, cycles, coverage.totalProposed)}
          />
        }
        outline={
          <SectionOutline
            entries={plan.entries.map((s) => ({
              id: s.id,
              label: s.label,
              accent: s.accent,
            }))}
            links={[
              { href: sectionHref('aip', fy, "browse"), label: t('section.tab.browse'), note: t('aipov.link.browseNote') },
              ...(METHODOLOGY_PUBLIC ? [{ href: sectionHref('aip', fy, 'methodology'), label: t('section.tab.methodology') }] : []),
              { href: "/learn", label: t('handoff.learn'), note: t('aipov.link.learnNote') },
            ]}
          />
        }
      />

      <div>
        {/* 01 — coverage first, deliberately. The most misleading thing a visitor
            can do on this page is read the running total as the city's budget. */}
        <SectionShell
          {...plan.props("what-this-is")}
          claim={
            <>
              {t('aipov.plan.claimLead')}{' '}
              <span className="text-ink-muted">{rich(t('aipov.plan.claimRest'), { count: officesOf })}</span>
            </>
          }
          lede={
            <>
              <p>
                {rich(t('aipov.plan.lede1'), {
                  published: <strong className="font-semibold text-ink">{t('aipov.plan.published')}</strong>,
                })}
              </p>
              <p className="mt-4">
                {rich(t('aipov.plan.lede2'), {
                  link: prior ? (
                    <Link
                      href={sectionHref('annual', prior.fiscalYear)}
                      className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                    >
                      {t('aipov.plan.priorLink', { fy: prior.fiscalYear })}
                    </Link>
                  ) : (
                    t('aipov.plan.noPrior')
                  ),
                })}
              </p>
            </>
          }
        >
          <StatBand
            stats={[
              {
                value: compactPeso(coverage.totalProposed),
                spoken: spokenPeso(coverage.totalProposed),
                label: t('aipov.stat.proposed', { fy }),
              },
              {
                value: `${coverage.publishedOfficeCount} / ${coverage.totalOfficeCount}`,
                label: t('aipov.stat.offices', { left: officesLeft }),
              },
              {
                value: coverage.programCount.toLocaleString('en-PH'),
                label: t('aipov.stat.programs', {
                  n: coverage.finishLinesRepresented,
                  total: coverage.finishLineCount,
                }),
              },
            ]}
          />
          {data.truncated && (
            <p className="mt-10 max-w-prose border-l-2 border-ink pl-4 text-sm text-ink-muted">
              {rich(t('aipov.truncated'), {
                browse: (
                  <Link
                    href={sectionHref('aip', fy, 'browse')}
                    className="underline decoration-rule underline-offset-4"
                  >
                    {t('section.tab.browse')}
                  </Link>
                ),
              })}
            </p>
          )}
        </SectionShell>

        {/* 02 — finish lines. All eight are listed even with nothing against
            them: at this stage the gaps are the story. */}
        <SectionShell
          {...plan.props("whats-in-it")}
          claim={
            coverage.finishLinesRepresented === coverage.finishLineCount ? (
              <>{t('aipov.fl.all', { total: coverage.finishLineCount })}</>
            ) : (
              rich(
                t(coverage.finishLinesRepresented === 1 ? 'aipov.fl.some.one' : 'aipov.fl.some.other'),
                {
                  count: (
                    <Mark color={accentOf('whats-in-it')}>
                      {t('aipov.plan.of', {
                        n: coverage.finishLinesRepresented,
                        total: coverage.finishLineCount,
                      })}
                    </Mark>
                  ),
                },
              )
            )
          }
          lede={
            <p>
              {rich(t('aipov.fl.lede'), {
                link: t('aipov.fl.link'),
              })}
            </p>
          }
          figure={
            <>
              <BarTable
                amountHeading={t('bar.estimated')}
                caption={t('aipov.fl.caption', { fy })}
                rows={data.finishLines.map((f) => ({
                  label: f.label,
                  amount: f.amount,
                  accent: f.accent,
                  meta: programmes(f.count),
                }))}
                emptyLabel={t('aipov.noneYet')}
              />
              <ExploreThis document="aip" year={fy} by="finishLine" />
            </>
          }
        />

        {/* 03 — who is asking: clusters, then the offices themselves. */}
        <SectionShell
          {...plan.props("whos-asking")}
          claim={
            biggestOffice && officeShare >= 40 ? (
              rich(t('aipov.who.one'), {
                office: officeName(biggestOffice),
                share: <Mark color={accentOf('whos-asking')}>{officeShare.toFixed(0)}%</Mark>,
              })
            ) : (
              <>{t('aipov.who.many', { count: coverage.publishedOfficeCount })}</>
            )
          }
          lede={<p>{t('aipov.who.lede')}</p>}
          figure={
            <div className="space-y-14">
              <div>
                <h3 className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                  {t('aipov.who.byCluster')}
                </h3>
                <>
                  <BarTable
                    amountHeading={t('bar.estimated')}
                    caption={t('aipov.who.clusterCaption', { fy })}
                    rows={data.clusters.map((c) => ({
                      label: c.label,
                      amount: c.amount,
                      accent: c.accent,
                      meta: programmes(c.count),
                    }))}
                    emptyLabel={t('aipov.noneYet')}
                  />
                  <ExploreThis document="aip" year={fy} by="cluster" />
                </>
              </div>
              <div>
                <h3 className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                  {t('aipov.who.byOffice')}
                </h3>
                <>
                  <BarTable
                    amountHeading={t('bar.estimated')}
                    caption={t('aipov.who.officeCaption', { fy })}
                    rows={data.offices.map((o, i) => ({
                      label: o.label,
                      sublabel: o.sublabel,
                      amount: o.amount,
                      meta: programmes(o.count),
                      highlight: i === 0 && officeShare >= 40,
                    }))}
                    limit={12}
                    moreHref={sectionHref('aip', fy, 'browse')}
                    moreLabel={t('aipov.who.more')}
                  />
                  <ExploreThis document="aip" year={fy} by="office" />
                </>
              </div>
            </div>
          }
        />

        {/* 04 — what it buys. */}
        <SectionShell
          {...plan.props("what-it-buys")}
          claim={
            mixTotal === 0 ? (
              <>{t('aipov.buys.none')}</>
            ) : (
              rich(t('aipov.buys.claim'), {
                share: <Mark color={accentOf('what-it-buys')}>{capitalShare.toFixed(0)}%</Mark>,
              })
            )
          }
          lede={
            <p>
              {t('aipov.buys.lede')}{' '}
              {expenseMix.classifiedProgramCount < coverage.programCount &&
                t('aipov.buys.partial', {
                  n: expenseMix.classifiedProgramCount,
                  total: coverage.programCount,
                })}
            </p>
          }
          figure={
            mixTotal > 0 ? (
              <StackedBar
                caption={t('aipov.buys.caption', { fy })}
                segments={[
                  {
                    label: t('expense.ps'),
                    gloss: t('expense.psGloss'),
                    amount: expenseMix.ps,
                    color: '#8EC5FF',
                  },
                  {
                    label: t('expense.mooe'),
                    gloss: t('expense.mooeGloss'),
                    amount: expenseMix.mooe,
                    color: '#2B7FFF',
                  },
                  // Financial charges only when there are some (specs/008).
                  ...(Number(expenseMix.fe) > 0
                    ? [
                        {
                          label: t('expense.fe'),
                          gloss: t('expense.feGloss'),
                          amount: expenseMix.fe,
                          color: '#1D4ED8',
                        },
                      ]
                    : []),
                  {
                    label: t('expense.co'),
                    gloss: t('expense.coGloss'),
                    amount: expenseMix.co,
                    color: '#193CB8',
                  },
                ]}
              />
            ) : (
              <p className="max-w-prose border-l-2 border-rule pl-4 text-sm text-ink-muted">
                {t('aipov.buys.empty')}
              </p>
            )
          }
        />

        {/* 05 — where the money comes from. */}
        <SectionShell
          {...plan.props("where-it-comes-from")}
          claim={
            leadFund ? (
              <>{t('aipov.fund.claim', { fund: leadFund.label })}</>
            ) : (
              <>{t('aipov.fund.none')}</>
            )
          }
          lede={<p>{t('aipov.fund.lede')}</p>}
          figure={
            <>
              <BarTable
                amountHeading={t('bar.estimated')}
                caption={t('aipov.fund.caption', { fy })}
                rows={data.fundSources.map((f) => ({
                  ...fundBucketLabels(f, t),
                  amount: f.amount,
                  meta: t(f.count === 1 ? 'entries.one' : 'entries.other', { count: f.count }),
                }))}
                countHeading={t('entries.heading')}
              />
              <ExploreThis document="aip" year={fy} by="fund" />
            </>
          }
        />

        {/* 06 — the gated comparison, rendered only once someone has decided the
            proposal is far enough along to compare. */}
        {showComparison && prior && (
          <SectionShell
            {...plan.props("vs-last-year")}
            eyebrow={t('aipov.vs.eyebrow', { prior: prior.fiscalYear })}
            claim={
              changePct === null ? (
                <>{t('aipov.vs.measured', { prior: prior.fiscalYear })}</>
              ) : (
                <>
                  {t(changePct >= 0 ? 'aipov.vs.above' : 'aipov.vs.below', {
                    prior: prior.fiscalYear,
                    pct: `${Math.abs(changePct).toFixed(0)}%`,
                  })}
                </>
              )
            }
            lede={
              <p>
                {rich(
                  t('aipov.vs.lede', {
                    n: coverage.publishedOfficeCount,
                    total: coverage.totalOfficeCount,
                  }),
                  {
                    link: (
                      <Link
                        href={sectionHref('annual', prior.fiscalYear)}
                        className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                      >
                        {t('aipov.vs.link', { prior: prior.fiscalYear })}
                      </Link>
                    ),
                  },
                )}
              </p>
            }
            figure={
              priorData && (
                <BarTable
                  amountHeading={t('bar.estimated')}
                  caption={t('aipov.vs.caption', { fy, prior: prior.fiscalYear })}
                  rows={[
                    {
                      label: t('aipov.vs.proposed', { fy }),
                      sublabel: t('aipov.vs.proposedSub'),
                      amount: coverage.totalProposed,
                      meta: t('entries.other', { count: coverage.programCount }),
                      highlight: true,
                    },
                    {
                      label: t('aipov.vs.enacted', { prior: prior.fiscalYear }),
                      sublabel: t('aipov.vs.enactedSub'),
                      amount: priorData.total,
                      meta: t('entries.other', { count: priorData.programCount }),
                    },
                  ]}
                  countHeading={t('entries.heading')}
                />
              )
            }
          />
        )}

        <HandOff kind="aip" year={fy} programCount={coverage.programCount} />
      </div>
    </>
  );
}
