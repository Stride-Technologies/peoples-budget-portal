import type { ReactNode } from 'react';
import { EditorialPage } from '@/components/public/editorial/editorial-page';
import { DevelopersNav } from '@/components/public/developers-nav';
import { getBrand } from '@/lib/brand-server';

// One header for both tabs, styled like LearnHero: the tabs sit on the rule and
// only the body below changes.
export default async function DevelopersLayout({ children }: { children: ReactNode }) {
  const brand = await getBrand();
  return (
    <EditorialPage>
      <header className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
            Developers · {brand.government}
          </p>
          <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.15rem+3.4vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.03em] text-ink">
            Developers and Open Data
          </h1>
          <div className="mt-7 max-w-[40rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
            <p>
              {brand.shortName}&apos;s published budget, free to download and reuse as
              spreadsheets or through a read-only API, and the code that runs
              this site, free for any local government to adopt.
            </p>
          </div>
          <DevelopersNav />
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-[46rem]">{children}</div>
      </div>
    </EditorialPage>
  );
}
