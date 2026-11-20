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
import { BarTable } from '@/components/public/editorial/bar-table';
import { StackedBar } from '@/components/public/editorial/stacked-bar';
import { HandOff } from '@/components/public/editorial/hand-off';
import type { MessageKey } from '@/i18n/t';
import { loadSectionCycle } from '@/lib/public-section-page';
import { loadPpmpOverview } from '@/lib/public-overview-data';
import { NOT_STATED } from '@/lib/ppmp-overview';
import { compactPeso, spokenPeso } from '@/lib/currency-formatter';
import { SECTION_LABEL, primarySection, METHODOLOGY_PUBLIC, sectionHref } from '@/lib/public-sections';
import { OG_IMAGES } from '@/lib/seo';
import { getT, localeAlternates } from '@/i18n/server';
import { rich } from '@/i18n/rich';

interface Props {
  params: Promise<{ year: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const t = await getT();
  const title = t('ppmpov.meta.title', { year });
  const description = t('ppmpov.meta.description');
  return {
    title,
    description,
    alternates: await localeAlternates(`/ppmp/${year}/overview`),
    openGraph: { images: OG_IMAGES, title, description },
  };
}

/**
 * Declared once: feeds the sections and the outline, numbered by position.
 * Accents are finish-line colours (lib/finish-lines.ts), and each section's bars
 * take its accent, so the page stays inside the portal's palette. Labels:
 * `ppmpov.s.<id>`.
 */
const ALL_SECTIONS = [
  { id: 'what-this-is', accent: '#00689D' },
  { id: 'what-it-buys', accent: '#4C9F38' },
  { id: 'how-its-bought', accent: '#FD6925', tinted: true },
  { id: 'when', accent: '#DD1367' },
  { id: 'whos-buying', accent: '#A21942', tinted: true },
] as const;

/**
 * Colour for each mode, in `PPMP_PROCUREMENT_MODES` order; its plain-words
 * gloss is `ppmpov.mode.<key>` (`notStated` for the unstated bucket).
 * The colours are tints of the section's accent, finish line 6's #FD6925
 * (lib/finish-lines.ts), so the bar reads as one section, not five palettes.
 */
const MODE_COLOR: Record<string, string> = {
  SMALL_VALUE_PROCUREMENT: '#FDBA74',
  COMPETITIVE_BIDDING: '#FD6925',
  NEGOTIATED_PROCUREMENT: '#C2410C',
  HIGHLY_TECHNICAL_CONSULTANTS: '#7C2D12',
  [NOT_STATED]: '#D6D3D1',
};
const MODE_GLOSS = {
  SMALL_VALUE_PROCUREMENT: 'ppmpov.mode.SMALL_VALUE_PROCUREMENT',
  COMPETITIVE_BIDDING: 'ppmpov.mode.COMPETITIVE_BIDDING',
  NEGOTIATED_PROCUREMENT: 'ppmpov.mode.NEGOTIATED_PROCUREMENT',
  HIGHLY_TECHNICAL_CONSULTANTS: 'ppmpov.mode.HIGHLY_TECHNICAL_CONSULTANTS',
  [NOT_STATED]: 'ppmpov.mode.notStated',
} as Record<string, MessageKey>;

export default async function PpmpOverviewPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('ppmp', year, 'overview');
  const data = await loadPpmpOverview(cycle);
  const fy = cycle.fiscalYear;
  const t = await getT();
  const count = (one: MessageKey, other: MessageKey, n: number) => t(n === 1 ? one : other, { count: n });

  const empty = data.planCount === 0;
  const plan = sectionPlan(
    (empty ? ALL_SECTIONS.slice(0, 1) : ALL_SECTIONS).map(
      (s): SectionPlanEntry => ({ ...s, label: t(`ppmpov.s.${s.id}`) }),
    ),
  );
  const accentOf = (id: string) => ALL_SECTIONS.find((s) => s.id === id)?.accent;

  const totalNumber = Number(data.total);
  const competitive = data.modes.find((m) => m.key === 'COMPETITIVE_BIDDING');
  const modeChosen = data.modes.filter((m) => m.key !== NOT_STATED);
  const chosenTotal = modeChosen.reduce((n, m) => n + Number(m.amount), 0);
  const competitiveShare =
    competitive && chosenTotal > 0 ? (Number(competitive.amount) / chosenTotal) * 100 : 0;
  const leadType = [...data.types]
    .filter((ty) => ty.key !== NOT_STATED && Number(ty.amount) > 0)
    .sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const busiest = [...data.months].sort((a, b) => Number(b.amount) - Number(a.amount))[0];
  const biggest = data.offices[0];
  const biggestShare = biggest && totalNumber > 0 ? (Number(biggest.amount) / totalNumber) * 100 : 0;

  // The year's budget, wherever it currently lives — the PPMP buys what it funds.
  const budgetKind = primarySection(cycle);

  return (
    <>
      <SectionChrome
        kind="ppmp"
        cycle={cycle}
        years={years}
        tab="overview"
        outline={
          empty ? undefined : (
            <SectionOutline
              entries={plan.entries.map((s) => ({ id: s.id, label: s.label, accent: s.accent }))}
              links={[
                { href: sectionHref('ppmp', fy, 'browse'), label: t('section.tab.browse'), note: t('ppmpov.link.browseNote') },
                ...(METHODOLOGY_PUBLIC ? [{ href: sectionHref('ppmp', fy, 'methodology'), label: t('section.tab.methodology') }] : []),
                { href: '/learn', label: t('handoff.learn'), note: t('aipov.link.learnNote') },
              ]}
            />
          )
        }
      />

      <div>
        {/* 01 — coverage first, as on the AIP: a running total read as the
            city's whole plan is the easiest mistake to make here. */}
        <SectionShell
          {...plan.props('what-this-is')}
          claim={
            empty ? (
              <>{t('ppmpov.empty', { fy })}</>
            ) : (
              <>
                {t('ppmpov.claimLead')}{' '}
                <span className="text-ink-muted">
                  {rich(t('aipov.plan.claimRest'), {
                    count: (
                      <Mark color={accentOf('what-this-is')}>
                        {t('aipov.plan.of', { n: data.officeCount, total: data.totalOfficeCount })}
                      </Mark>
                    ),
                  })}
                </span>
              </>
            )
          }
          lede={
            <>
              <p>
                {rich(t('ppmpov.lede1'), {
                  published: <strong className="font-semibold text-ink">{t('ppmpov.published')}</strong>,
                })}
              </p>
              <p className="mt-4">
                {rich(t('ppmpov.lede2'), {
                  link: (
                    <Link
                      href={sectionHref(budgetKind, fy)}
                      className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
                    >
                      {t('ppmpov.budgetLink', { fy, document: SECTION_LABEL[budgetKind] })}
                    </Link>
                  ),
                })}
              </p>
            </>
          }
        >
          {!empty && (
            <StatBand
              stats={[
                {
                  value: compactPeso(data.total),
                  spoken: spokenPeso(data.total),
                  label: t('ppmpov.stat.planned', { fy }),
                },
                {
                  value: `${data.officeCount} / ${data.totalOfficeCount}`,
                  label: t('ppmpov.stat.offices'),
                },
                {
                  value: data.lineItemCount.toLocaleString('en-PH'),
                  label: count('ppmpov.stat.items.one', 'ppmpov.stat.items.other', data.planCount),
                },
              ]}
            />
          )}
        </SectionShell>

        {!empty && (
          <>
            {/* 02 — what kind of thing. */}
            <SectionShell
              {...plan.props('what-it-buys')}
              claim={
                leadType ? (
                  rich(t(Number(leadType.amount) > totalNumber / 2 ? 'ppmpov.type.most' : 'ppmpov.type.largest'), {
                    type: <Mark color={accentOf('what-it-buys')}>{leadType.label.toLowerCase()}</Mark>,
                  })
                ) : (
                  <>{t('ppmpov.type.none')}</>
                )
              }
              lede={
                <p>{t('ppmpov.type.lede')}</p>
              }
              figure={
                <BarTable
                  amountHeading={t('bar.planned')}
                  caption={t('ppmpov.type.caption', { fy })}
                  barColor={accentOf('what-it-buys')}
                  countHeading={t('items.heading')}
                  rows={data.types.map((ty) => ({
                    label: ty.label,
                    amount: ty.amount,
                    meta: count('items.one', 'items.other', ty.count),
                  }))}
                  emptyLabel={t('annov.none')}
                />
              }
            />

            {/* 03 — how it will be bought: the accountability question. */}
            <SectionShell
              {...plan.props('how-its-bought')}
              claim={
                chosenTotal > 0 ? (
                  rich(t('ppmpov.how.claim'), {
                    share: <Mark color={accentOf('how-its-bought')}>{competitiveShare.toFixed(0)}%</Mark>,
                  })
                ) : (
                  <>{t('ppmpov.how.none')}</>
                )
              }
              lede={
                <p>{t('ppmpov.how.lede')}</p>
              }
              figure={
                <StackedBar
                  caption={t('ppmpov.how.caption', { fy })}
                  segments={data.modes
                    .filter((m) => Number(m.amount) > 0)
                    .map((m) => ({
                      label: m.label,
                      gloss: t(MODE_GLOSS[m.key]),
                      amount: m.amount,
                      color: MODE_COLOR[m.key],
                    }))}
                />
              }
            />

            {/* 04 — when the buying starts. */}
            <SectionShell
              {...plan.props('when')}
              claim={
                busiest && Number(busiest.amount) > 0 ? (
                  rich(t('ppmpov.when.claim'), {
                    month: <Mark color={accentOf('when')}>{busiest.label}</Mark>,
                  })
                ) : (
                  <>{t('ppmpov.when.none')}</>
                )
              }
              lede={
                <p>{t('ppmpov.when.lede')}</p>
              }
              figure={
                <BarTable
                  amountHeading={t('bar.planned')}
                  caption={t('ppmpov.when.caption', { fy })}
                  barColor={accentOf('when')}
                  countHeading={t('items.heading')}
                  rows={data.months.map((m) => ({
                    label: m.label,
                    amount: m.amount,
                    meta: m.count === 0 ? '—' : count('items.one', 'items.other', m.count),
                  }))}
                  emptyLabel={t('ppmpov.when.empty')}
                />
              }
            />

            {/* 05 — who is buying. */}
            <SectionShell
              {...plan.props('whos-buying')}
              claim={
                biggest && biggestShare >= 40 ? (
                  rich(t('ppmpov.who.one'), {
                    office: `${biggest.sublabel} (${biggest.label})`,
                    share: <Mark color={accentOf('whos-buying')}>{biggestShare.toFixed(0)}%</Mark>,
                  })
                ) : (
                  <>{count('ppmpov.who.many.one', 'ppmpov.who.many.other', data.officeCount)}</>
                )
              }
              lede={
                <p>{t('ppmpov.who.lede')}</p>
              }
              figure={
                <BarTable
                  amountHeading={t('bar.planned')}
                  caption={t('ppmpov.who.caption', { fy })}
                  barColor={accentOf('whos-buying')}
                  countHeading={t('plans.heading')}
                  rows={data.offices.map((o, i) => ({
                    label: o.label,
                    sublabel: o.sublabel,
                    amount: o.amount,
                    meta: count('plans.one', 'plans.other', o.count),
                    highlight: i === 0 && biggestShare >= 40,
                  }))}
                  limit={12}
                  moreHref={sectionHref('ppmp', fy, 'browse')}
                  moreLabel={t('aipov.who.more')}
                />
              }
            />
          </>
        )}

        <HandOff
          kind="ppmp"
          year={fy}
          programCount={data.planCount}
          noun={t(data.planCount === 1 ? 'plans.noun.one' : 'plans.noun.other')}
          also={{
            href: sectionHref(budgetKind, fy),
            label: budgetKind === 'annual' ? 'Annual Budget' : 'AIP',
            gloss: t('ppmpov.also.gloss', { fy }),
          }}
        />
      </div>
    </>
  );
}
