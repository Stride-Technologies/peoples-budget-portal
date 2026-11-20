import type { ReactNode } from 'react';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { EditorialPage } from './editorial-page';
import { VISIONS } from '@/lib/finish-lines';
import { cn } from '@/lib/utils';
import { GovernmentLink } from '@/components/brand/brand-text';

/**
 * The shell every policy document sits in — privacy, terms, licence, and the
 * placeholders.
 *
 * All of them had the identical shape copied three times: a `bg-primary` slab
 * with a centred icon tile and a bold h1, then a `max-w-4xl` body. Recolouring
 * each in place would have left three copies to drift again, so the shape lives
 * here once.
 *
 * The reading measure is deliberately narrower than the Overview's. These are
 * documents someone reads in sequence, not scans, and ~68 characters is where
 * long prose stops being tiring.
 */
export function PolicyPage({
  eyebrow,
  title,
  lede,
  meta,
  accent = VISIONS[7].color,
  children,
}: {
  eyebrow: ReactNode;
  title: string;
  lede?: ReactNode;
  /** Effective date, licence name — the one line of metadata a policy carries. */
  meta?: ReactNode;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <EditorialPage>
      <header className="border-b border-rule">
        <div className="mx-auto max-w-7xl px-4 pb-12 pt-14 sm:px-6 sm:pt-20 lg:px-8">
          <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
            {eyebrow}
          </p>
          <h1 className="mt-4 max-w-[34rem] font-display text-[clamp(2rem,1.3rem+2.6vw,3.25rem)] font-medium leading-[1.06] tracking-[-0.03em] text-ink">
            {title}
          </h1>
          <span
            aria-hidden="true"
            className="mt-7 block h-px w-16"
            style={{ backgroundColor: accent }}
          />
          {lede && (
            <div className="mt-7 max-w-[38rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
              {lede}
            </div>
          )}
          {meta && (
            <p className="mt-8 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-ink-faint">
              {meta}
            </p>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-[46rem]">{children}</div>
      </div>
    </EditorialPage>
  );
}

/**
 * One numbered clause of a policy.
 *
 * A hairline and a mono number rather than a bordered card with a tinted header
 * bar: twenty stacked cards read as twenty separate things, when a policy is one
 * document with numbered parts.
 */
export function PolicySection({
  id,
  number,
  title,
  children,
  className,
}: {
  id: string;
  number: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      id={id}
      className={cn('scroll-mt-24 border-t border-rule pt-9 first:border-t-0 first:pt-0', className)}
    >
      <div className="flex items-baseline gap-3">
        <span
          aria-hidden="true"
          className="font-mono text-[0.6875rem] tabular-nums text-ink-faint"
        >
          {number.padStart(2, '0')}
        </span>
        <h2 className="font-display text-[1.375rem] font-medium leading-snug tracking-[-0.02em] text-ink">
          {title}
        </h2>
      </div>
      <div className="mt-5 space-y-4 text-[0.9375rem] leading-7 text-ink-muted [&_a]:underline [&_a]:decoration-rule [&_a]:underline-offset-4 [&_a:hover]:text-ink [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </section>
  );
}

/** The stack a policy's clauses sit in. */
export function PolicySections({ children }: { children: ReactNode }) {
  return <div className="space-y-9">{children}</div>;
}

/**
 * Where a policy hands the reader onward. Every policy ended with a different
 * ad-hoc footer; this is the one shape.
 */
export function PolicyFooter({ children }: { children?: ReactNode }) {
  return (
    <div className="mt-14 border-t border-rule pt-8 text-sm leading-7 text-ink-muted">
      {children ?? (
        <p>
          Questions about this document? Ask the{' '}
          <GovernmentLink className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink" />
          , or read{' '}
          <Link
            href="/learn"
            className="underline decoration-rule underline-offset-4 transition-colors hover:text-ink"
          >
            how the budget works
          </Link>
          .
        </p>
      )}
    </div>
  );
}
