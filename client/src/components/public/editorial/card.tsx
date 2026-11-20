import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The public pages' card surface, in one place.
 *
 * The recipe — `rounded-2xl border border-rule bg-paper-raised` — was repeated
 * across the overview, Learn, visions and home pages, and had already drifted
 * (some instances carried a shadow, some did not; two used `border-border`, which
 * is the app's neutral rather than the editorial rule). One component means the
 * next surface added is cohesive by default rather than by memory.
 */
export function EditorialCard({
  as: Tag = 'div',
  className,
  children,
}: {
  as?: 'div' | 'article' | 'li' | 'section';
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-rule bg-paper-raised',
        className,
      )}
    >
      {children}
    </Tag>
  );
}

/**
 * Several cards joined into one block by hairlines rather than gaps.
 *
 * `gap-px` over a `bg-rule` ground draws the dividers, so the children only need
 * their own background — which is why they are plain `bg-paper-raised` rather
 * than `EditorialCard`. Used for the hand-off row, the "go deeper" links and the
 * milestone list.
 */
export function EditorialCardGroup({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-2xl border border-rule bg-rule',
        className,
      )}
    >
      {children}
    </div>
  );
}
