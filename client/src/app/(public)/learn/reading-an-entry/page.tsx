import type { Metadata } from 'next';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { AipCodeAnatomy, PpaHierarchy } from '@/components/public/editorial/diagrams';
import { LearnHero, LearnSection } from '@/components/public/learn/learn-section';
import { OG_IMAGES } from '@/lib/seo';
import { getT, localeAlternates } from '@/i18n/server';
import { rich } from '@/i18n/rich';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const description = t('entry.meta.description');
  return {
    title: t('entry.meta.title'),
    description,
    alternates: await localeAlternates('/learn/reading-an-entry'),
    openGraph: { images: OG_IMAGES, title: t('entry.meta.ogTitle'), description },
  };
}

const link = 'underline decoration-rule underline-offset-4 transition-colors hover:text-ink';

export default async function ReadingAnEntryPage() {
  const t = await getT();
  const strong = (text: string) => <strong className="font-semibold text-ink">{text}</strong>;
  const browse = (
    <Link href="/aip" className={link}>
      {t('entry.browse')}
    </Link>
  );
  return (
    <EditorialPage>
      <LearnHero eyebrow={t('entry.hero.eyebrow')} title={t('entry.hero.title')}>
        <p>{rich(t('entry.hero.body'), { browse })}</p>
      </LearnHero>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <LearnSection first id="how-entries-work" eyebrow={t('entry.s1.eyebrow')} title={t('entry.s1.title')}>
          <div className="mt-10">
            <PpaHierarchy />
          </div>

          <div className="mt-12 max-w-[40rem] space-y-5 text-base leading-7 text-ink-muted">
            <p>
              {rich(t('entry.s1.p1'), {
                program: strong(t('entry.word.program')),
                projects: strong(t('entry.word.projects')),
                activities: strong(t('entry.word.activities')),
              })}
            </p>
            <p>{t('entry.s1.p2')}</p>
            <p>
              {rich(t('entry.s1.p3'), {
                office: strong(t('entry.word.office')),
                finishLines: strong(t('entry.word.finishLines')),
                fund: strong(t('entry.word.fund')),
              })}
            </p>
          </div>
        </LearnSection>

        <LearnSection
          id="reference-code"
          eyebrow={t('entry.s2.eyebrow')}
          title={t('entry.s2.title')}
          lede={
            <p>
              {rich(t('entry.s2.lede'), {
                code: <span className="font-mono text-[0.9375rem] text-ink">8000-2-03-58-002-001-000</span>,
                browse,
              })}
            </p>
          }
        >
          <div className="mt-10">
            <AipCodeAnatomy />
          </div>
        </LearnSection>
      </div>
    </EditorialPage>
  );
}
