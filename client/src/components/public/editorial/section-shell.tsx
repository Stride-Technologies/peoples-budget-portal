import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * One numbered section of an editorial page — one screen tall, from `lg` up.
 *
 * The rhythm the whole Overview is built on: a mono eyebrow naming the step, one
 * display-sized claim, an optional paragraph of support, then the evidence beside
 * it. The claim is the point — if a section needs three paragraphs to make it,
 * the claim is not sharp enough yet.
 *
 * `<section aria-labelledby>` with the claim as the accessible name, so a screen
 * reader's landmark list reads as an outline of the argument. The eyebrow is
 * decorative and hidden: "02 · WHAT'S IN IT" announced before every heading is
 * noise, and the same information is in the heading itself.
 *
 * ## Layout
 *
 * The **claim** column is the one that pins, which is the inversion of the
 * obvious arrangement and the right way round here: the figures are long ranked
 * tables, so what a reader needs held in view while scanning forty-five offices
 * is the sentence telling them what they are looking at.
 *
 * Sections are their natural height. An earlier version made them one screen tall
 * with the figure in its own scroll pane and the page snapping between them; it
 * constrained the page more than it helped, and it made desktop behave unlike
 * mobile for no gain. Navigation is handled by the outline drawer instead.
 */
export function SectionShell({
  id,
  step,
  totalSteps,
  eyebrow,
  claim,
  lede,
  figure,
  children,
  accent,
  tinted = false,
  className,
}: {
  id: string;
  step: number;
  totalSteps: number;
  eyebrow: string;
  claim: ReactNode;
  lede?: ReactNode;
  figure?: ReactNode;
  /** Full-width evidence, below the claim. Used where a figure would be cramped. */
  children?: ReactNode;
  /**
   * Section colour, as a hex. Carries no information — it is the section's
   * identity, on the step number, the rule and the figure's edge — so it is free
   * to be chosen for rhythm rather than constrained by contrast on text.
   */
  accent?: string;
  /** Sit this section on the tinted band rather than plain paper. */
  tinted?: boolean;
  className?: string;
}) {
  const headingId = `${id}-claim`;
  const ink = accent ?? 'var(--ink)';

  const head = (
    <div>
      <div className="flex items-baseline gap-4">
        <span
          aria-hidden="true"
          data-step-number
          className="font-display text-[2.75rem] font-medium leading-none tracking-[-0.04em]"
          style={{ color: ink }}
        >
          {String(step).padStart(2, '0')}
        </span>
        <span
          aria-hidden="true"
          className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint"
        >
          {eyebrow}
        </span>
      </div>

      <span
        aria-hidden="true"
        data-rule
        className="mt-6 block h-px w-16 origin-left"
        style={{ backgroundColor: ink }}
      />

      <h2
        id={headingId}
        data-claim
        className={cn(
          'mt-6 font-display font-medium tracking-[-0.03em] text-ink',
          figure
            ? 'text-[clamp(1.75rem,1.1rem+2.4vw,2.75rem)]'
            : 'max-w-[46rem] text-[clamp(2rem,1.15rem+3.4vw,3.5rem)]',
          // Last, not first: tailwind-merge reads an arbitrary `text-[...]` as the
          // font-size/line-height shorthand, so a `leading-*` written before it is
          // dropped from the output entirely. This claim had been rendering at the
          // inherited 1.5 rather than 1.08 the whole time.
          'leading-[1.08]',
        )}
      >
        {claim}
      </h2>

      {lede && (
        <div
          data-reveal
          className={cn(
            'mt-6 text-base leading-7 text-ink-muted',
            figure
              ? 'text-[0.9375rem] leading-7'
              : 'max-w-[38rem] sm:text-lg sm:leading-8',
          )}
        >
          {lede}
        </div>
      )}
    </div>
  );

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn(
        'scroll-mt-24 border-t border-rule py-16 sm:py-24',
        tinted && 'bg-paper-tint',
        className,
      )}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {figure ? (
          <div className="lg:grid lg:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] lg:gap-16 xl:gap-24">
            {/* `self-start` is what makes `sticky` mean anything: a grid item
                stretches to the row height by default, so a sticky child with
                nothing left to scroll past never moves. */}
            <div className="lg:sticky lg:top-24 lg:self-start">{head}</div>
            <div
              className="mt-10 border-l-0 lg:mt-0 lg:border-l-2 lg:pl-8"
              style={{ borderColor: accent ?? 'var(--rule)' }}
            >
              {figure}
            </div>
          </div>
        ) : (
          <>
            {head}
            {children && <div className="mt-10 sm:mt-14">{children}</div>}
          </>
        )}

      </div>
    </section>
  );
}

// ─── Section plans ───────────────────────────────────────────────────────────

export interface SectionPlanEntry {
  id: string;
  /** Used for the eyebrow *and* the outline, so the two cannot drift. */
  label: string;
  accent?: string;
  tinted?: boolean;
}

/**
 * One declaration of a page's sections, feeding both the rendered sections and
 * the outline drawer.
 *
 * Before this, each `SectionShell` call repeated its own `id`, `step`, `eyebrow`
 * and hardcoded `totalSteps`, and the outline would have had to repeat all of it
 * a third time. Numbering is derived from position, so a section that does not
 * render — the year-on-year comparison, which is behind a switch — renumbers the
 * rest instead of leaving a gap.
 */
export function sectionPlan(entries: SectionPlanEntry[]) {
  const total = entries.length;
  return {
    total,
    entries,
    /** Everything `SectionShell` needs for one section, by id. */
    props(id: string) {
      const index = entries.findIndex((e) => e.id === id);
      if (index === -1) {
        throw new Error(`sectionPlan: no section "${id}" in this plan`);
      }
      const entry = entries[index];
      return {
        id: entry.id,
        step: index + 1,
        totalSteps: total,
        eyebrow: entry.label,
        accent: entry.accent,
        tinted: entry.tinted ?? false,
      };
    },
  };
}
