import type { ReactNode } from 'react';

export interface Stat {
  /** The figure itself, already formatted for reading. */
  value: string;
  /** How the figure should be announced, if reading it aloud differs. */
  spoken?: string;
  label: ReactNode;
}

/**
 * The three-or-four figure band under a section's claim.
 *
 * Display-sized numbers with a line of prose each. Where a figure is
 * abbreviated — `₱147.87M` — `spoken` carries the version a screen reader can
 * hold, because "peso one four seven point eight seven M" is not a quantity.
 */
export function StatBand({ stats }: { stats: Stat[] }) {
  return (
    <dl
      data-stagger
      className="grid grid-cols-1 gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3"
    >
      {stats.map((stat) => (
        <div key={stat.value + String(stat.label)} className="border-t border-rule pt-5">
          <dd className="font-display text-[clamp(2.25rem,1.5rem+2.4vw,3.25rem)] font-medium leading-none tracking-[-0.03em] text-ink">
            {stat.spoken ? (
              <>
                <span aria-hidden="true">{stat.value}</span>
                <span className="sr-only">{stat.spoken}</span>
              </>
            ) : (
              stat.value
            )}
          </dd>
          <dt className="mt-3 text-sm leading-6 text-ink-muted">{stat.label}</dt>
        </div>
      ))}
    </dl>
  );
}
