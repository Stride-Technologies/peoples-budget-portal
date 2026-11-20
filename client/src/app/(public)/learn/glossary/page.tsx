import type { Metadata } from 'next';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { OutlineRail } from '@/components/public/editorial/outline-rail';
import { LearnHero } from '@/components/public/learn/learn-section';
import { GLOSSARY, GLOSSARY_TERM_COUNT, SOURCE_LABEL, glossaryAnchor } from '@/lib/glossary';
import { glossaryCopy } from '@/i18n/code-copy';
import { getLocale, getT, localeAlternates } from '@/i18n/server';
import { OG_IMAGES } from '@/lib/seo';
import { getBrand } from '@/lib/brand-server';
import { messageVars } from '@/lib/brand';



export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  const description = t('glossary.meta.description');
  return {
    title: t('glossary.meta.title'),
    description,
    alternates: await localeAlternates('/learn/glossary'),
    openGraph: { images: OG_IMAGES, title: t('glossary.meta.ogTitle'), description },
  };
}

export default async function GlossaryPage() {
  const locale = await getLocale();
  const t = await getT();
  // Anchors come from the English, so a link to #appropriation works in every language.
  const groups = glossaryCopy(locale, messageVars(await getBrand(), locale));
  const anchor = (i: number) => glossaryAnchor(GLOSSARY[i].heading);
  return (
    <EditorialPage>
      <LearnHero eyebrow={t('glossary.hero.eyebrow')} title={t('glossary.hero.title', { count: GLOSSARY_TERM_COUNT })}>
        <p>{t('glossary.hero.body')}</p>
        {locale !== 'en' && <p>{t('glossary.termsNote')}</p>}
      </LearnHero>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <OutlineRail
          title={t('glossary.outline')}
          entries={groups.map((g, i) => ({ id: anchor(i), label: g.heading }))}
        />

        <div className="mt-14 space-y-16">
          {groups.map((group, i) => (
            // The id is on the section, not the heading, so the outline tracks
            // the whole group while you read it, not just the moment its title
            // passes.
            <section
              key={anchor(i)}
              id={anchor(i)}
              aria-labelledby={`${anchor(i)}-title`}
              className="scroll-mt-24"
            >
              <h2
                id={`${anchor(i)}-title`}
                className="font-display text-2xl font-medium tracking-[-0.02em] text-ink"
              >
                {group.heading}
              </h2>
              <p className="mt-2 max-w-[38rem] text-sm text-ink-faint">{group.blurb}</p>
              <dl className="mt-8 space-y-8">
                {group.entries.map((entry) => (
                  <div
                    key={entry.term}
                    id={glossaryAnchor(entry.term)}
                    className="scroll-mt-24 sm:grid sm:grid-cols-[15rem_minmax(0,1fr)] sm:gap-10"
                  >
                    <dt className="text-sm font-medium text-ink" lang="en">
                      {entry.term}
                      {entry.short && (
                        <span className="ml-2 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">
                          {entry.short}
                        </span>
                      )}
                    </dt>
                    <dd className="mt-2 max-w-[38rem] text-[0.9375rem] leading-7 text-ink-muted sm:mt-0">
                      {entry.definition}
                      <span className="sr-only">
                        {' '}
                        {t('glossary.paraphrased', { source: SOURCE_LABEL[entry.source] })}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <p className="mt-14 max-w-[38rem] border-l-2 border-rule pl-4 text-sm leading-6 text-ink-faint">
          {t('glossary.footer', SOURCE_LABEL)}
        </p>
      </div>
    </EditorialPage>
  );
}
