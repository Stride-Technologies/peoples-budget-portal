import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { LearnNav } from './learn-nav';

/**
 * The page header every Learn page opens with, ending in the Learn tabs. Full
 * width with its own gutter so the rule under the tabs spans the viewport, as
 * on the AIP and Annual Budget sections — render it outside the page container.
 */
export function LearnHero({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
}) {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto max-w-7xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-[40rem] font-display text-[clamp(2rem,1.15rem+3.4vw,3.5rem)] font-medium leading-[1.06] tracking-[-0.03em] text-ink">
          {title}
        </h1>
        <div className="mt-7 max-w-[40rem] text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          {children}
        </div>
        <LearnNav />
      </div>
    </header>
  );
}

/** A numbered section with the editorial heading treatment. */
export function LearnSection({
  id,
  eyebrow,
  title,
  lede,
  first = false,
  children,
}: {
  id: string;
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  first?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn(
        first ? 'mt-12 sm:mt-16' : 'mt-20 border-t border-rule pt-14 sm:mt-28',
      )}
    >
      <div data-reveal>
        <p
          aria-hidden="true"
          className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint"
        >
          {eyebrow}
        </p>
        <h2
          id={id}
          className="mt-5 max-w-[36rem] font-display text-[clamp(1.75rem,1.1rem+2.4vw,2.75rem)] font-medium leading-[1.1] tracking-[-0.03em] text-ink"
        >
          {title}
        </h2>
        {lede && (
          <div className="mt-6 max-w-[38rem] text-base leading-7 text-ink-muted">{lede}</div>
        )}
      </div>
      {children}
    </section>
  );
}
