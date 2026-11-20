'use client';

import { useEffect, useRef, useState } from 'react';
import { LocaleLink as Link } from '@/components/i18n/locale-link';
import { useT } from '@/i18n/locale-provider';
import { List, X } from 'lucide-react';
import { animateOutlineOpen } from './editorial-motion';
import { cn } from '@/lib/utils';

export interface OutlineEntry {
  id: string;
  label: string;
  /** The section's own colour, used to mark the active row. */
  accent?: string;
}

export interface OutlineLink {
  href: string;
  label: string;
  note?: string;
}

/**
 * The id of the section the reader is in, from an `IntersectionObserver` into
 * React state. Shared by the drawer below and `OutlineRail`.
 */
export function useActiveSection(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(ids[0] ?? null);
  const key = ids.join('|');

  useEffect(() => {
    const targets = key
      .split('|')
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;

    const observer = new IntersectionObserver(
      (records) => {
        // The section whose top is highest on screen but still above the middle
        // of the viewport. Picking "first intersecting" instead makes the label
        // flicker between two sections at every boundary.
        const visible = records
          .filter((r) => r.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: 0 },
    );

    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [key]);

  return activeId;
}

/**
 * A chapter outline for a long editorial page, in a full-height left drawer.
 *
 * This replaces the scroll snapping. Snapping constrained the page — one screen
 * per section, desktop behaving unlike mobile — to solve a problem that is really
 * about *navigation*: a seven-section argument is hard to move around in. An
 * outline solves that directly, works at every width, and takes nothing away.
 *
 * The trigger is **pinned to the bottom-right corner**, not placed in the header.
 * In the header it was only reachable at the top of the page, which is the one
 * place a reader does not need it: the whole point is jumping *out* of somewhere.
 * Pinned, it is available at any scroll position, and it shows the section you
 * are currently in — so it doubles as a position indicator while closed.
 *
 * ## State lives in React, deliberately
 *
 * The active section comes from an `IntersectionObserver` into `useState`. That is
 * the correct pattern and not the trap from the previous round: what failed then
 * was writing to `data-` attributes that React itself declares in JSX, so React
 * reset them on the next render. Here React owns the state outright.
 *
 * ## Without JavaScript
 *
 * The drawer needs JS to open, so the outline is rendered as a plain `<nav>` of
 * in-page anchors that is always in the DOM. With JS the drawer presents it; with
 * JS off the links are still reachable and still work, because they are anchors to
 * ids that exist.
 */
export function SectionOutline({
  entries,
  links,
  title,
}: {
  entries: OutlineEntry[];
  links?: OutlineLink[];
  title?: string;
}) {
  const t = useT();
  title ??= t('outline.title');
  const [open, setOpen] = useState(false);
  const activeId = useActiveSection(entries.map((e) => e.id));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Dialog behaviour: Esc, focus in, focus back, focus trapped ────────────
  useEffect(() => {
    if (!open) return;

    if (panelRef.current) animateOutlineOpen(panelRef.current);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Captured now rather than read in cleanup: by then the ref may point
    // somewhere else, and focus would be returned to the wrong element.
    const trigger = triggerRef.current;
    // Move focus into the panel so a keyboard user is not left behind the
    // overlay, tabbing through the page underneath.
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;

      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    // The page behind must not scroll while a full-height overlay is open.
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      // ponytail: clear, don't restore — a snapshot taken while a Base UI lock is held is
      // "hidden" and would freeze the page until reload. Fine while this overlay is the only
      // modal on screen; move it onto Base UI Dialog if that stops being true.
      document.body.style.overflow = '';
      (previouslyFocused ?? trigger)?.focus();
    };
  }, [open]);

  const activeLabel =
    entries.find((e) => e.id === activeId)?.label ?? entries[0]?.label ?? '';
  const activeIndex = Math.max(
    0,
    entries.findIndex((e) => e.id === activeId),
  );
  const activeAccent = entries[activeIndex]?.accent;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-end p-4 sm:p-6">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          className="pointer-events-auto group inline-flex max-w-[min(20rem,calc(100vw-2rem))] items-center gap-2.5 rounded-full border border-rule bg-paper-raised/95 px-4 py-2.5 text-left shadow-lg backdrop-blur transition-colors hover:bg-paper-tint"
        >
          <List aria-hidden="true" className="size-4 shrink-0 text-ink-faint" />
          <span
            className="font-mono text-[0.625rem] tabular-nums"
            style={{ color: activeAccent ?? 'var(--ink-faint)' }}
          >
            {String(activeIndex + 1).padStart(2, '0')}/
            {String(entries.length).padStart(2, '0')}
          </span>
          <span className="truncate text-sm text-ink">{activeLabel}</span>
        </button>
      </div>

      {/* Always in the DOM so the anchors work with JS disabled; the drawer only
          changes how they are presented. */}
      <div
        className={cn(
          'fixed inset-0 z-[60]',
          open ? 'block' : 'pointer-events-none hidden',
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => setOpen(false)}
          className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[2px]"
        />

        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-outline-panel
          className="absolute inset-y-0 left-0 flex w-full max-w-[30rem] flex-col bg-paper-deep shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-rule/60 px-6 py-4 sm:px-8">
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-muted">
              {title}
            </p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-2 rounded-full p-2 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
              aria-label={t('outline.close')}
            >
              <X aria-hidden="true" className="size-4" />
            </button>
          </div>

          <nav
            aria-label={title}
            className="flex-1 overflow-y-auto px-6 py-4 sm:px-8"
          >
            <ol>
              {entries.map((entry, i) => {
                const isActive = entry.id === activeId;
                return (
                  <li key={entry.id} data-outline-row>
                    <a
                      href={`#${entry.id}`}
                      onClick={() => setOpen(false)}
                      aria-current={isActive ? 'true' : undefined}
                      className="group flex items-baseline gap-3 border-b border-ink/10 py-4 transition-colors"
                    >
                      {/* The section's own colour marks where you are. Ink
                          against ink-muted is too fine a distinction at display
                          size to find at a glance. */}
                      <span
                        aria-hidden="true"
                        className={cn(
                          'mb-1 w-1 shrink-0 self-stretch rounded-full transition-opacity',
                          isActive ? 'opacity-100' : 'opacity-0',
                        )}
                        style={{ backgroundColor: entry.accent ?? 'var(--ink)' }}
                      />
                      <span
                        className={cn(
                          'font-display text-[clamp(1.5rem,1.1rem+1.4vw,2.125rem)] font-medium leading-none tracking-[-0.03em] transition-colors',
                          isActive ? '' : 'text-ink-muted group-hover:text-ink',
                        )}
                        style={isActive ? { color: entry.accent ?? undefined } : undefined}
                      >
                        {entry.label}
                      </span>
                      <span
                        aria-hidden="true"
                        className="font-mono text-[0.625rem] tabular-nums text-ink-faint"
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>

            {links && links.length > 0 && (
              <div className="mt-8">
                <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
                  {t('outline.elsewhere')}
                </p>
                <ul className="mt-3 space-y-1">
                  {links.map((link) => (
                    <li key={link.href} data-outline-row>
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="flex items-baseline justify-between gap-4 py-2.5 text-sm text-ink-muted transition-colors hover:text-ink"
                      >
                        <span>{link.label}</span>
                        {link.note && (
                          <span className="shrink-0 text-xs text-ink-faint">
                            {link.note}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </nav>
        </div>
      </div>
    </>
  );
}
