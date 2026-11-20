import type { Metadata } from 'next';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
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
import { loadOverview } from '@/lib/public-overview-data';
import { compactPeso, spokenPeso } from '@/lib/currency-formatter';
import { cyclesIn, METHODOLOGY_PUBLIC, sectionHref } from '@/lib/public-sections';
import { OG_IMAGES } from '@/lib/seo';
import { getT, localeAlternates } from '@/i18n/server';
import { fundBucketLabels } from '@/lib/budget-overview';
import { rich } from '@/i18n/rich';
import { getBrand } from '@/lib/brand-server';
import { SPECIAL_FUNDS } from '@/lib/schemas';

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const brand = await getBrand();
  const t = await getT();
  const description = t('annov.meta.description', { place: brand.placeName });
  const title = t('annov.meta.title', { year, place: brand.placeName });
  return {
    title,
    description,
    alternates: await localeAlternates(`/annual/${year}/overview`),
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/**
 * The page's sections, declared once.
 *
 * Feeds both the rendered sections and the outline drawer, so the two cannot
 * drift, and numbering comes from position — dropping the comparison section
 * renumbers the rest rather than leaving a gap at 06. Labels: `annov.s.<id>`.
 */
const ALL_SECTIONS = [
  { id: "this-is-law", accent: "#00689D" },
  { id: "what-its-for", accent: "#4C9F38" },
  { id: "who-spends-it", accent: "#FD6925", tinted: true },
  { id: "three-sections", accent: "#E5243B" },
  { id: "what-it-buys", accent: "#1447E6" },
  { id: "where-it-comes-from", accent: "#A21942", tinted: true },
] as const;

/** How an office is named in prose: full name, acronym in brackets. */
function officeName(office: { label: string; sublabel?: string }): string {
  return office.sublabel ? `${office.sublabel} (${office.label})` : office.label;
}

export default async function AnnualOverviewPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years, cycles } = await loadSectionCycle('annual', year, 'overview');
  const data = await loadOverview(cycle, 'annual');
  const t = await getT();

  const { coverage, expenseMix } = data;
  const fy = cycle.fiscalYear;
  const total = Number(coverage.totalProposed);
  const share = (amount: string) => (total > 0 ? (Number(amount) / total) * 100 : 0);
  const entries = (count: number) =>
    count === 0 ? '—' : t(count === 1 ? 'entries.one' : 'entries.other', { count });

  const mixTotal = Number(expenseMix.total);
  const capitalShare = mixTotal > 0 ? (Number(expenseMix.co) / mixTotal) * 100 : 0;
  const gas = data.papClasses.find((p) => p.key === 'GAS');
  const topOffices = data.offices.slice(0, 3);

  // A year whose book records no fund against any row (FY2026) has nothing to
  // show in section 06, so the section is left out and the rest renumber. Newer
  // cycles record a fund per entry, and the section returns with them.
  const namedFundTotal = data.fundSources
    .filter((f) => !f.key.startsWith('__'))
    .reduce((sum, f) => sum + Number(f.amount), 0);
  const hasFundData = namedFundTotal > 0;
  // Special funds with rows this year, each with a page of its own (specs/016).
  const specialFunds = data.fundSources.filter((f) => SPECIAL_FUNDS.includes(f.key));

  // The proposal that will succeed this one, if it is already on the site.
  const nextProposal = cyclesIn(cycles, 'aip').find((c) => c.fiscalYear > fy) ?? null;

  const accentOf = (id: string) =>
    ALL_SECTIONS.find((s) => s.id === id)?.accent;

  const plan = sectionPlan(
    ALL_SECTIONS.filter((s) => s.id !== 'where-it-comes-from' || hasFundData).map(
      (s): SectionPlanEntry => ({ ...s, label: t(`annov.s.${s.id}`) }),
    ),
  );
  const strong = (text: string) => <strong className="font-semibold text-ink">{text}</strong>;

  return (
    <>
      <SectionChrome
        kind="annual"
        cycle={cycle}
        years={years}
        tab="overview"
        outline={
          <SectionOutline
            entries={plan.entries.map((s) => ({
              id: s.id,
              label: s.label,
              accent: s.accent,
            }))}
            links={[
              { href: sectionHref('annual', fy, "browse"), label: t('section.tab.browse'), note: t('aipov.link.browseNote') },
              ...(METHODOLOGY_PUBLIC ? [{ href: sectionHref('annual', fy, 'methodology'), label: t('section.tab.methodology') }] : []),
              { href: "/learn", label: t('handoff.learn'), note: t('aipov.link.learnNote') },
            ]}
          />
        }
      />

      <div>
        {/* 01 — this one is settled. The opposite framing to the AIP Overview,
            and the distinction the whole two-section split exists to make. */}
        <SectionShell
          {...plan.props("this-is-law")}
          claim={
            <>
              {t('annov.law.lead')}{' '}
              <span className="text-ink-muted">
                {rich(t('annov.law.rest'), {
                  fy: <Mark color={accentOf('this-is-law')}>{fy}</Mark>,
                })}
              </span>
            </>
          }
          lede={
            <>
              <p>{t('annov.law.lede1')}</p>
              <p className="mt-4">
                {t('annov.law.lede2')}
                {nextProposal && (
                  <>
                    {' '}
                    {rich(t('annov.law.next'), {
                      link: (
                        <Link
                          href={sectionHref('aip', nextProposal.fiscalYear)}
                          className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                        >
                          {t('annov.law.nextLink', { fy: nextProposal.fiscalYear })}
                        </Link>
                      ),
                    })}
                  </>
                )}
              </p>
            </>
          }
        >
          <StatBand
            stats={[
              // The sum of rows once the year is an enacted Ordinance: specs/016
              // seeds the special-fund sheets (SPA, LDF, LDRRMF) into it, so the
              // rows hold every peso. Until then (specs/013) a year served from
              // its old Program rows has the office appropriations only, and the
              // ordinance's stated total is the headline — shown, never summed.
              !cycle.hasEnactedOrdinance &&
              cycle.statedTotal &&
              cycle.statedOfficeTotal &&
              cycle.statedSpecialTotal
                ? {
                    value: compactPeso(cycle.statedTotal),
                    spoken: spokenPeso(cycle.statedTotal),
                    label: t(cycle.statedSource ? 'annov.stat.statedBy' : 'annov.stat.stated', {
                      fy,
                      source: cycle.statedSource ?? '',
                      office: compactPeso(cycle.statedOfficeTotal),
                      special: compactPeso(cycle.statedSpecialTotal),
                    }),
                  }
                : {
                    value: compactPeso(coverage.totalProposed),
                    spoken: spokenPeso(coverage.totalProposed),
                    label: t('annov.stat.enacted', { fy }),
                  },
              {
                value: coverage.programCount.toLocaleString('en-PH'),
                label: t('annov.stat.entries', { count: coverage.publishedOfficeCount }),
              },
              {
                value: `${capitalShare.toFixed(0)}%`,
                label: t('annov.stat.capital'),
              },
            ]}
          />
        </SectionShell>

        {/* 02 — what it is for. */}
        <SectionShell
          {...plan.props("what-its-for")}
          claim={
            data.finishLines[0] ? (
              rich(t('annov.for.claim'), {
                share: (
                  <Mark color={accentOf('what-its-for')}>
                    {share(data.finishLines[0].amount).toFixed(0)}%
                  </Mark>
                ),
                line: <span className="text-ink-muted">{data.finishLines[0].label}</span>,
              })
            ) : (
              <>{t('annov.for.none')}</>
            )
          }
          lede={
            <p>
              {rich(t('annov.for.lede'), {
                link: t('aipov.fl.link'),
              })}
            </p>
          }
          figure={
            <>
              <BarTable
                amountHeading={t('bar.appropriation')}
                caption={t('annov.for.caption', { fy })}
                rows={data.finishLines.map((f) => ({
                  label: f.label,
                  amount: f.amount,
                  accent: f.accent,
                  meta: entries(f.count),
                }))}
                countHeading={t('entries.heading')}
                emptyLabel={t('annov.none')}
              />
              <ExploreThis document="ordinance" year={fy} by="finishLine" />
            </>
          }
        />

        {/* 03 — who spends it. */}
        <SectionShell
          {...plan.props("who-spends-it")}
          claim={
            topOffices.length === 3 ? (
              rich(t('annov.who.three'), {
                share: (
                  <Mark color={accentOf('who-spends-it')}>
                    {topOffices
                      .reduce((sum, o) => sum + share(o.amount), 0)
                      .toFixed(0)}
                    %
                  </Mark>
                ),
              })
            ) : (
              <>{t('annov.who.many', { count: coverage.publishedOfficeCount })}</>
            )
          }
          lede={
            <p>
              {topOffices.length > 0 && (
                <>
                  {t('annov.who.largest', {
                    office: officeName(topOffices[0]),
                    amount: compactPeso(topOffices[0].amount),
                  })}{' '}
                </>
              )}
              {t('annov.who.lede')}
            </p>
          }
          figure={
            <div className="space-y-14">
              <div>
                <h3 className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                  {t('aipov.who.byCluster')}
                </h3>
                <>
                  <BarTable
                    amountHeading={t('bar.appropriation')}
                    caption={t('annov.who.clusterCaption', { fy })}
                    rows={data.clusters.map((c) => ({
                      label: c.label,
                      amount: c.amount,
                      accent: c.accent,
                      meta: entries(c.count),
                    }))}
                    countHeading={t('entries.heading')}
                    emptyLabel={t('annov.none')}
                  />
                  <ExploreThis document="ordinance" year={fy} by="cluster" />
                </>
              </div>
              <div>
                <h3 className="mb-5 font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                  {t('aipov.who.byOffice')}
                </h3>
                <>
                  <BarTable
                    amountHeading={t('bar.appropriation')}
                    caption={t('annov.who.officeCaption', { fy })}
                    rows={data.offices.map((o, i) => ({
                      label: o.label,
                      sublabel: o.sublabel,
                      amount: o.amount,
                      meta: t(o.count === 1 ? 'entries.one' : 'entries.other', { count: o.count }),
                      highlight: i === 0,
                    }))}
                    countHeading={t('entries.heading')}
                    limit={12}
                    moreHref={sectionHref('annual', fy, 'browse')}
                    moreLabel={t('aipov.who.more')}
                  />
                  <ExploreThis document="ordinance" year={fy} by="office" />
                </>
              </div>
            </div>
          }
        />

        {/* 04 — the three sections. The most striking number on the page and the
            most jargon-heavy, so it gets explained rather than just stated. */}
        <SectionShell
          {...plan.props("three-sections")}
          claim={
            gas ? (
              rich(t('annov.sec.claim'), {
                share: (
                  <Mark color={accentOf('three-sections')}>
                    {share(gas.amount).toFixed(0)}%
                  </Mark>
                ),
                gas: <span className="text-ink-muted">General Administrative Services</span>,
              })
            ) : (
              <>{t('annov.sec.none')}</>
            )
          }
          lede={
            <>
              <p>
                {rich(t('annov.sec.lede1'), {
                  ops: strong('Operations'),
                  sto: strong('Support to Operations'),
                  gas: strong('General Administrative Services'),
                })}
              </p>
              <p className="mt-4">{t('annov.sec.lede2')}</p>
            </>
          }
          figure={
            <BarTable
              amountHeading={t('bar.appropriation')}
              caption={t('annov.sec.caption', { fy })}
              rows={data.papClasses.map((p) => ({
                label: p.label,
                sublabel: p.key,
                amount: p.amount,
                meta: t(p.count === 1 ? 'entries.one' : 'entries.other', { count: p.count }),
                highlight: p.key === 'GAS',
              }))}
              countHeading={t('entries.heading')}
            />
          }
        />

        {/* 05 — what it buys. */}
        <SectionShell
          {...plan.props("what-it-buys")}
          claim={
            mixTotal > 0 ? (
              rich(t('annov.buys.claim'), {
                share: (
                  <Mark color={accentOf('what-it-buys')}>
                    {capitalShare.toFixed(0)}%
                  </Mark>
                ),
              })
            ) : (
              <>{t('annov.buys.none')}</>
            )
          }
          lede={<p>{t('annov.buys.lede')}</p>}
          figure={
            mixTotal > 0 ? (
              <StackedBar
                caption={t('annov.buys.caption', { fy })}
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
                {t('annov.buys.empty')}
              </p>
            )
          }
        />

        {/* 06 — where it comes from, only for a year that records it. */}
        {hasFundData && (
          <SectionShell
            {...plan.props("where-it-comes-from")}
            claim={<>{t('annov.fund.claim', { fund: data.fundSources[0].label })}</>}
            lede={
              <>
                <p>{t('annov.fund.lede')}</p>
                {specialFunds.length > 0 && (
                  <p className="mt-4">
                    {t('annov.fund.special')}{' '}
                    {specialFunds.map((f, i) => (
                      <span key={f.key}>
                        {i > 0 && ' · '}
                        <Link
                          href={`/annual/${fy}/funds/${f.key.toLowerCase()}`}
                          className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                        >
                          {f.label}
                        </Link>
                      </span>
                    ))}
                  </p>
                )}
              </>
            }
            figure={
              <>
                <BarTable
                  amountHeading={t('bar.appropriation')}
                  caption={t('annov.fund.caption', { fy })}
                  rows={data.fundSources.map((f) => ({
                    ...fundBucketLabels(f, t),
                    amount: f.amount,
                    meta: t(f.count === 1 ? 'entries.one' : 'entries.other', { count: f.count }),
                  }))}
                  countHeading={t('entries.heading')}
                />
                <ExploreThis document="ordinance" year={fy} by="fund" />
              </>
            }
          />
        )}

        <HandOff kind="annual" year={fy} programCount={coverage.programCount} />
      </div>
    </>
  );
}
