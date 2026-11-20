import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { BrandText } from '@/components/brand/brand-text';
import { getT } from '@/i18n/server';
import { SECTION_LABEL, type PublicSection } from '@/lib/public-sections';
import { EditorialPage } from './editorial-page';

/** A section's front door while it has no year to show (`redirectToNewest`). */
export async function SectionEmpty({ kind }: { kind: PublicSection }) {
  const t = await getT();
  return (
    <EditorialPage>
      <div className="mx-auto max-w-7xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14 lg:px-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          <BrandText field="government" />
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.75rem,1.2rem+2.2vw,2.75rem)] font-medium leading-tight tracking-[-0.03em] text-ink">
          {SECTION_LABEL[kind]}
        </h1>
        <p className="mt-6 max-w-[38rem] text-base leading-7 text-ink-muted">{t(`section.empty.${kind}`)}</p>
        <p className="mt-6">
          <Link href="/learn" className="text-sm text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink">
            {t('section.empty.learn')}
          </Link>
        </p>
      </div>
    </EditorialPage>
  );
}
