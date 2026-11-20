'use client';

import { usePathname } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { useT } from '@/i18n/locale-provider';
import { splitLocale } from '@/i18n/locales';

// Labels and glosses are in the catalogue (specs/014): `learn.pages.<id>.*`.
export const LEARN_PAGES = [
  { id: 'cycle', href: '/learn' },
  { id: 'aipVsAnnual', href: '/learn/aip-vs-annual-budget' },
  { id: 'entry', href: '/learn/reading-an-entry' },
  { id: 'glossary', href: '/learn/glossary' },
] as const;

/**
 * The four Learn pages as tabs, at the foot of each page's header — the same
 * place the AIP and Annual Budget sections put Overview / Browse / Methodology.
 * Scrolls sideways on a phone.
 */
export function LearnNav() {
  const pathname = splitLocale(usePathname()).path;
  const t = useT();
  return (
    <nav aria-label={t('learn.nav.aria')} className="mt-10">
      <ul className="-mx-4 flex gap-7 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        {LEARN_PAGES.map((p) => {
          const active = pathname === p.href;
          return (
            <li key={p.href} className="shrink-0">
              <Link
                href={p.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'inline-flex min-h-11 items-center border-b-2 text-sm transition-colors',
                  active
                    ? 'border-ink font-medium text-ink'
                    : 'border-transparent text-ink-muted hover:border-rule hover:text-ink',
                )}
              >
                {t(`learn.pages.${p.id}.label`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Previous / next at the foot of every Learn page. The tabs already list all
 * four pages, so the foot offers one step, not the menu again — and it is
 * deliberately not a card grid, so it never reads as the external "Go deeper"
 * links on the budget-cycle page.
 */
export function LearnPager() {
  const pathname = splitLocale(usePathname()).path;
  const t = useT();
  const i = LEARN_PAGES.findIndex((p) => p.href === pathname);
  if (i < 0) return null;
  const prev = LEARN_PAGES[i - 1];
  const next = LEARN_PAGES[i + 1];

  return (
    <nav aria-label={t('learn.pager.aria')} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div className="mt-20 grid gap-10 border-t border-rule py-14 sm:mt-28 sm:grid-cols-2 sm:py-20">
        {prev && (
          <Link href={prev.href} className="group flex flex-col gap-3">
            <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
              <ArrowLeft aria-hidden="true" className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
              {t('learn.pager.previous')}
            </span>
            <span className="font-display text-xl font-medium tracking-[-0.02em] text-ink-muted transition-colors group-hover:text-ink">
              {t(`learn.pages.${prev.id}.label`)}
            </span>
          </Link>
        )}
        {next && (
          <Link
            href={next.href}
            className="group flex flex-col gap-3 sm:col-start-2 sm:items-end sm:text-right"
          >
            <span className="flex items-center gap-2 font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint">
              {t('learn.pager.next', {
                n: String(i + 2).padStart(2, '0'),
                total: String(LEARN_PAGES.length).padStart(2, '0'),
              })}
              <ArrowRight aria-hidden="true" className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-medium leading-tight tracking-[-0.03em] text-ink underline decoration-transparent underline-offset-[6px] transition-colors group-hover:decoration-ink">
              {t(`learn.pages.${next.id}.label`)}
            </span>
            <span className="max-w-[26rem] text-sm leading-6 text-ink-muted">
              {t(`learn.pages.${next.id}.gloss`)}
            </span>
          </Link>
        )}
      </div>
    </nav>
  );
}
