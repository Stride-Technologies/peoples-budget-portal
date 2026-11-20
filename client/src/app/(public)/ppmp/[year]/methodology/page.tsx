import type { Metadata } from 'next';
import Link from 'next/link';
import { SectionChrome } from '@/components/public/editorial/section-chrome';
import { Note } from '@/components/public/editorial/methodology';
import { loadSectionCycle } from '@/lib/public-section-page';
import { loadPpmpOverview } from '@/lib/public-overview-data';
import { formatWholePesos } from '@/lib/currency-formatter';
import { SECTION_LABEL, primarySection, sectionHref } from '@/lib/public-sections';
import { canonical, OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { GOALS, goal } from '@/lib/goal-label';
import { LguWord } from '@/components/brand/brand-text';


interface Props { params: Promise<{ year: string }> }

const DESCRIPTION =
  'Where the procurement plan figures come from, what they cover, and what they do not.';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { year } = await params;
  const title = `Methodology | Project Procurement Management Plan ${year} | ${(await getBrand()).placeName}`;
  return {
    title,
    description: DESCRIPTION,
    alternates: { canonical: canonical(`/ppmp/${year}/methodology`) },
    openGraph: { images: OG_IMAGES, title, description: DESCRIPTION },
  };
}

/**
 * Written framing over live figures, like the budget sections' Methodology:
 * every number is read from the same data the Overview uses, and the sentences
 * only say things that stay true as plans are published.
 */
export default async function PpmpMethodologyPage({ params }: Props) {
  const { year } = await params;
  const { cycle, years } = await loadSectionCycle('ppmp', year, 'methodology');
  const data = await loadPpmpOverview(cycle);
  const fy = cycle.fiscalYear;
  const budgetKind = primarySection(cycle);
  const link = 'underline decoration-rule underline-offset-4 transition-colors hover:text-ink';

  return (
    <>
      <SectionChrome kind="ppmp" cycle={cycle} years={years} tab="methodology" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="py-16 sm:py-20">
          <div className="max-w-[42rem]">
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
              Methodology
            </p>
            <h2 className="mt-3 font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink">
              Where these figures come from
            </h2>
            <p className="mt-6 text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              Each office writes its own procurement plan and publishes it when
              it is ready, so this section fills up over the year. This page says
              what is counted, what the amounts mean, and what is not here.
            </p>
          </div>

          <dl className="mt-16 space-y-12 border-t border-rule pt-12">
            <Note term="What is counted">
              <p>
                {data.planCount.toLocaleString('en-PH')} published plan
                {data.planCount === 1 ? '' : 's'} from {data.officeCount} of{' '}
                {data.totalOfficeCount} <LguWord k="lguAdj" /> offices, holding{' '}
                {data.lineItemCount.toLocaleString('en-PH')} items and totalling{' '}
                <strong className="font-semibold text-ink">₱{formatWholePesos(data.total)}</strong>.
                Offices that have not published are absent, not counted as zero.
              </p>
              <p className="mt-3">
                A plan appears only once it has been approved and the
                office publishes it. If an office changes a published plan, it
                comes down until it is approved again.
              </p>
            </Note>

            <Note term="What the amount means">
              <p>
                An item&rsquo;s amount is its quantity times its estimated unit
                cost, as the office planned it. It is an estimate made before
                buying — not a contract price, and not money paid. A plan&rsquo;s
                total is the sum of its items, added as whole centavos so totals
                are exact.
              </p>
            </Note>

            <Note term="Type, mode and month">
              <p>
                The type of purchase, the mode of procurement and the start month
                are what each office entered for each item. Offices sometimes
                leave the type or mode blank early on; those items are counted
                under &ldquo;not stated yet&rdquo; rather than left out, so every
                breakdown still adds up to the total.
              </p>
            </Note>

            <Note term={`${GOALS} and clusters`}>
              <p>
                A plan is not filed against a {goal} the way a budget entry
                is; it belongs to an office. So the finish-line filter on Browse
                shows plans from the offices whose cluster works on that finish
                line — a guide to where to look, not a tag the office chose.
                The cluster and office filters are exact.
              </p>
            </Note>

            <Note term="How it connects to the budget">
              <p>
                A plan buys what the budget funds. Each plan names the program it
                draws on in its own words; this site does not yet check those
                amounts against{' '}
                <Link href={sectionHref(budgetKind, fy)} className={link}>
                  the {fy} {SECTION_LABEL[budgetKind]}
                </Link>
                , so read the two side by side rather than expecting them to match
                line for line.
              </p>
            </Note>

            <Note term="Corrections">
              <p>
                Every plan on{' '}
                <Link href={sectionHref('ppmp', fy, 'browse')} className={link}>
                  Browse
                </Link>{' '}
                takes public feedback, and it reaches the office that wrote it.
              </p>
            </Note>
          </dl>
        </div>
      </div>
    </>
  );
}
