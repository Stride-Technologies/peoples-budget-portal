'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { SectionOutline, useActiveSection, type OutlineEntry } from './section-outline';

/**
 * An outline that stays out of the way: a column of short lines pinned to the
 * right edge, one per section, the current one longer and darker. Hover or
 * focus it and the section titles appear (Notion's pattern) over a paper
 * gradient that is solid at the edge and fades out leftward — enough to keep the
 * titles readable over body text, without a card's border and shadow.
 *
 * Desktop only (`xl`+), where the margin beside the content can hold it. Below
 * that there is no hover and no margin, so the same entries go to the
 * bottom-right `SectionOutline` drawer the AIP and Annual Budget pages use.
 *
 * The labels are always in the DOM — collapsed to zero width, not removed — so
 * screen readers and keyboard users get the full list, and focusing a link opens
 * the card the way hovering does.
 */
export function OutlineRail({
  entries,
  title = 'On this page',
}: {
  entries: OutlineEntry[];
  title?: string;
}) {
  const activeId = useActiveSection(entries.map((e) => e.id));

  // Fixed to the viewport, it would otherwise sit on the dark footer at the end
  // of the page. Logged-in visitors get no public footer; then this never fires.
  const [overFooter, setOverFooter] = useState(false);
  useEffect(() => {
    const footer = document.querySelector('footer');
    if (!footer) return;
    const observer = new IntersectionObserver(([r]) => setOverFooter(r.isIntersecting));
    observer.observe(footer);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <nav
        aria-label={title}
        className={cn(
          'group fixed right-0 top-1/2 z-30 hidden -translate-y-1/2 pr-4 transition-opacity duration-300 xl:block',
          overFooter && 'pointer-events-none opacity-0',
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-y-16 right-0 -z-10 w-[30rem] bg-gradient-to-l from-paper via-paper/95 via-55% to-transparent opacity-0 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)] transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100"
        />
        <ol className="flex flex-col gap-1 py-2">
          {entries.map((entry) => {
            const active = entry.id === activeId;
            return (
              <li key={entry.id}>
                <a
                  href={`#${entry.id}`}
                  aria-current={active ? 'true' : undefined}
                  className="group/row flex min-h-6 items-center justify-end gap-3 py-1 pl-2"
                >
                  <span
                    className={cn(
                      'max-w-0 overflow-hidden whitespace-nowrap text-sm opacity-0 transition-[max-width,opacity] duration-200 group-focus-within:max-w-[18rem] group-focus-within:opacity-100 group-hover:max-w-[18rem] group-hover:opacity-100',
                      active ? 'font-medium text-ink' : 'text-ink-muted group-hover/row:text-ink',
                    )}
                  >
                    {entry.label}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      'h-0.5 shrink-0 rounded-full transition-[width,background-color]',
                      active ? 'w-5 bg-ink' : 'w-3 bg-ink-faint/50',
                    )}
                  />
                </a>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="xl:hidden">
        <SectionOutline entries={entries} title={title} />
      </div>
    </>
  );
}
