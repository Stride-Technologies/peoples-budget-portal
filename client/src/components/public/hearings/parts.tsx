import type { ReactNode } from 'react';
import { VISIONS } from '@/lib/finish-lines';
import { GOAL } from '@/lib/goal-label';
import { cn } from '@/lib/utils';

// Pieces both the server pages and the client session view use: nothing here reads the request.

export const EYEBROW = 'font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-ink-faint';
export const CARD = 'rounded-xl border border-rule bg-paper-raised p-6';

/** The standing warning: a machine made this, and nobody has checked it. */
export function MachineNotice({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="mt-6 flex max-w-[44rem] flex-col gap-1 rounded-lg border border-rule bg-paper-tint px-4 py-3 text-sm leading-6 text-ink-muted sm:flex-row sm:gap-3">
      <span className={cn(EYEBROW, 'shrink-0 sm:pt-1')}>{label}</span>
      <span>{children}</span>
    </p>
  );
}

// Dark number where white on the colour is under 4.5:1 (green, yellow, cyan, orange).
const DARK_INK = new Set([2, 3, 4, 6]);

/** A goal as a numbered circle in its colour; its name is the accessible name and the tooltip. */
export function GoalDot({ n, name }: { n: number; name?: string }) {
  const label = `${GOAL} ${n}${name ? `: ${name}` : ''}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
        DARK_INK.has(n) ? 'text-ink' : 'text-white',
      )}
      style={{ backgroundColor: VISIONS[n - 1]?.color ?? '#5A5754' }}
    >
      {n}
    </span>
  );
}

/** `2026-10-13` in the page's language. An unparseable date prints as it came. */
export function formatDay(date: string | undefined, localeTag: string): string {
  if (!date) return '';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? date
    : d.toLocaleDateString(localeTag, { day: 'numeric', month: 'long', year: 'numeric' });
}
