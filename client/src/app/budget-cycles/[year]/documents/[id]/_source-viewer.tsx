'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { ExternalLink, X } from 'lucide-react';
import type { SourceLink } from '@/lib/api';

/**
 * A row's reference opens its scan in a panel docked beside the table, at the
 * row's page, in the browser's own PDF viewer (framed from /api/source-pdf).
 * Not a modal: the table stays scrollable and clickable, so a reviewer walks
 * the rows against the scan, and another row's reference swaps the scan in place.
 *
 * ponytail: page-level only. Highlighting the row needs pdf.js and the OCR
 * grid's row box stored per item; add both if reviewers lose rows on a page.
 */
type Open = { source: SourceLink; label: string; href: string };

// ponytail: one module-level slot, since one page shows one scan at a time.
let current: Open | null = null;
const listeners = new Set<() => void>();
function set(next: Open | null) {
  current = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const useOpen = () => useSyncExternalStore(subscribe, () => current, () => null);

/** The panel's width on wide screens; the page gives up the same space while it is open. */
const DOCK = 'lg:w-[min(50vw,56rem)]';
const DOCK_MARGIN = 'lg:mr-[min(50vw,56rem)]';
/** The reference whose scan is open, so a reviewer keeps their place in the list. */
const ACTIVE_REF = 'rounded bg-amber-100 px-1 font-medium text-amber-950 underline';

export function SourceViewer({ source, label, href }: Open) {
  const open = useOpen();
  // Rows on one scan page share the href; the label (p. · row) tells them apart.
  const active = open?.href === href && open.label === label;
  return (
    <button
      type="button"
      onClick={() => set({ source, label, href })}
      title={`Open ${source.file}${source.page ? ` at page ${source.page}` : ''}`}
      aria-pressed={active}
      className={active ? ACTIVE_REF : 'underline hover:text-neutral-700'}
    >
      {label}
    </button>
  );
}

/** Wraps the page: makes room for the docked scan and renders it. */
export function SourceViewerLayout({ children }: { children: ReactNode }) {
  const open = useOpen();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && set(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  // Leaving the page closes it, so the next document does not open on this scan.
  useEffect(() => () => set(null), []);

  return (
    <>
      <div className={open ? DOCK_MARGIN : undefined}>{children}</div>
      {open && (
        <aside
          aria-label={`Source: ${open.source.file}`}
          className={`fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-neutral-200 bg-white shadow-xl ${DOCK}`}
        >
          <div className="flex items-start gap-3 border-b border-neutral-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-neutral-900">{open.source.file}</p>
              <p className="flex flex-wrap items-center gap-x-3 text-sm text-neutral-500">
                <span>{open.label}</span>
                {open.source.url && (
                  <a
                    href={open.source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline hover:text-neutral-700"
                  >
                    On the LGU site <ExternalLink className="size-3" aria-hidden />
                  </a>
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => set(null)}
              aria-label="Close the scan"
              className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            >
              <X className="size-5" />
            </button>
          </div>
          {/* key: a new page in the same file must reload, not keep the old hash. */}
          <iframe key={open.href} src={open.href} title={`${open.source.file}, ${open.label}`} className="min-h-0 w-full flex-1 bg-neutral-100" />
        </aside>
      )}
    </>
  );
}
