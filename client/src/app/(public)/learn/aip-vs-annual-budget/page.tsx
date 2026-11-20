import type { Metadata } from 'next';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { getLocale, getT, localeAlternates } from '@/i18n/server';
import { cycleCopy } from '@/i18n/budget-cycle';
import { rich } from '@/i18n/rich';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { MoneyFlow } from '@/components/public/editorial/diagrams';
import { LearnHero, LearnSection } from '@/components/public/learn/learn-section';
import { apiPublicGetCycles } from '@/lib/api';
import { cyclesIn, sectionHref } from '@/lib/public-sections';
import { OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { messageVars } from '@/lib/brand';



export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const description = t('aipvs.meta.description');
  return {
    title: t('aipvs.meta.title'),
    description,
    alternates: await localeAlternates('/learn/aip-vs-annual-budget'),
    openGraph: { images: OG_IMAGES, title: t('aipvs.meta.ogTitle'), description },
  };
}

/** The stages at which an amount can change between the plan and what is spent (`aipvs.move.<n>`). */
const WHERE_AMOUNTS_MOVE = [3, 5, 6, 7, 8] as const;

const link = 'underline decoration-rule underline-offset-4 transition-colors hover:text-ink';

export default async function AipVsAnnualBudgetPage() {
  const t = await getT();
  const locale = await getLocale();
  const { stages } = cycleCopy(locale, messageVars(await getBrand(), locale));
  const cycles = await apiPublicGetCycles();
  const proposal = cyclesIn(cycles, 'aip')[0] ?? null;
  const enacted = cyclesIn(cycles, 'annual')[0] ?? null;

  return (
    <EditorialPage>
      <LearnHero eyebrow={t('aipvs.hero.eyebrow')} title={t('aipvs.hero.title')}>
        <p>
          {rich(t('aipvs.hero.body'), {
            cycle: <Link href="/learn" className={link}>{t('aipvs.hero.cycleLink')}</Link>,
          })}
        </p>
      </LearnHero>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LearnSection first id="two-documents" eyebrow={t('aipvs.s1.eyebrow')} title={t('aipvs.s1.title')}>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule lg:grid-cols-2">
            <article className="bg-paper-raised p-7 sm:p-9">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                {t('aipvs.plan.kicker')}
              </p>
              <h3 className="mt-4 font-display text-2xl font-medium tracking-[-0.02em] text-ink">
                {t('aipvs.plan.title')}
              </h3>
              <p className="mt-4 text-[0.9375rem] leading-7 text-ink-muted">
                {rich(t('aipvs.plan.body'), { propose: <em>{t('aipvs.plan.propose')}</em> })}
              </p>
              {proposal && (
                <p className="mt-6">
                  <Link href={sectionHref('aip', proposal.fiscalYear)} className={`text-sm ${link}`}>
                    {t('aipvs.plan.read', { year: proposal.fiscalYear })}
                  </Link>
                </p>
              )}
            </article>

            <article className="bg-paper-raised p-7 sm:p-9">
              <p className="font-mono text-[0.625rem] uppercase tracking-[0.14em] text-ink-faint">
                {t('aipvs.law.kicker')}
              </p>
              <h3 className="mt-4 font-display text-2xl font-medium tracking-[-0.02em] text-ink">
                {t('aipvs.law.title')}
              </h3>
              <p className="mt-4 text-[0.9375rem] leading-7 text-ink-muted">
                {t('aipvs.law.body')}
              </p>
              {enacted && (
                <p className="mt-6">
                  <Link href={sectionHref('annual', enacted.fiscalYear)} className={`text-sm ${link}`}>
                    {t('aipvs.law.read', { year: enacted.fiscalYear })}
                  </Link>
                </p>
              )}
            </article>
          </div>
          <p className="mt-6 max-w-[40rem] text-[0.9375rem] leading-7 text-ink-muted">
            {rich(t('aipvs.s1.foot'), {
              aip: <Link href="/aip" className={link}>AIP</Link>,
              annual: <Link href="/annual" className={link}>Annual Budget</Link>,
            })}
          </p>
        </LearnSection>

        <LearnSection
          id="why-they-differ"
          eyebrow={t('aipvs.s2.eyebrow')}
          title={t('aipvs.s2.title')}
          lede={t('aipvs.s2.lede')}
        >
          <ol className="mt-10 max-w-3xl divide-y divide-rule border-y border-rule">
            {WHERE_AMOUNTS_MOVE.map((n) => (
              <li key={n} className="grid gap-1 py-5 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8">
                <Link href={`/learn#stage-${n}`} className={`text-sm font-medium text-ink ${link}`}>
                  {t('aipvs.s2.stage', { n, title: stages[n].title })}
                </Link>
                <p className="text-[0.9375rem] leading-7 text-ink-muted">{t(`aipvs.move.${n}`)}</p>
              </li>
            ))}
          </ol>
        </LearnSection>

        <LearnSection
          id="what-a-figure-is"
          eyebrow={t('aipvs.s3.eyebrow')}
          title={t('aipvs.s3.title')}
          lede={t('aipvs.s3.lede')}
        >
          <div className="mt-10">
            <MoneyFlow />
          </div>
        </LearnSection>
      </div>
    </EditorialPage>
  );
}
