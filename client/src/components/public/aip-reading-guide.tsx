'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocaleLink } from '@/components/i18n/locale-link';
import { readingGuideCopy } from '@/i18n/code-copy';
import { useLocale } from '@/i18n/locale-provider';
import { fillGuideText, type AipReadingGuideFigures } from '@/lib/aip-reading-guide-copy';
import { useBrand } from '@/components/brand/brand-provider';
import { messageVars } from '@/lib/brand';



const dismissedKey = (fiscalYear: number) => `aip-guide-dismissed:${fiscalYear}`;

/** Storage may be blocked or throw (private mode, disabled site data): treat as "never dismissed". */
function wasDismissed(fiscalYear: number): boolean {
  try {
    return window.localStorage.getItem(dismissedKey(fiscalYear)) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed(fiscalYear: number) {
  try {
    window.localStorage.setItem(dismissedKey(fiscalYear), '1');
  } catch {
    // Not remembered — the guide shows again next visit, which is the safe side.
  }
}

/**
 * The status banner ("Approved by the Sangguniang Panlungsod." for 2027) and the first-visit reading guide on an
 * AIP year's pages (specs/013 FR-001–FR-006).
 *
 * The guide opens after hydration, never in the server render, so a visitor
 * without JavaScript still gets the page (and the banner) unobstructed. It is
 * a Base UI Dialog, which owns focus trapping, Escape and the page scroll lock
 * — nothing here touches `overflow` (ARCHITECTURE-ESSENTIALS, Client UI).
 *
 * Renders nothing for a year with no copy.
 */
export function AipReadingGuide({
  fiscalYear,
  figures,
}: {
  fiscalYear: number;
  figures: AipReadingGuideFigures;
}) {
  const locale = useLocale();
  const brand = useBrand();
  const copy = useMemo(() => readingGuideCopy(locale, fiscalYear, messageVars(brand, locale)), [locale, fiscalYear, brand]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    // Deferred so the first paint is the page, not the dialog's mount.
    const t = setTimeout(() => {
      if (copy && !wasDismissed(fiscalYear)) setOpen(true);
    }, 0);
    return () => clearTimeout(t);
  }, [copy, fiscalYear]);

  if (!copy) return null;
  const fill = (text: string) => fillGuideText(text, figures);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) rememberDismissed(fiscalYear);
  }

  return (
    <>
      <div
        role="note"
        className="mt-6 flex max-w-prose items-start gap-3 rounded-lg border border-rule bg-paper-tint px-4 py-3 text-sm text-ink"
      >
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ink-muted" />
        <p>
          <strong className="font-semibold">{copy.banner.lead}</strong>{' '}
          {copy.banner.body}{' '}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-medium text-ink underline decoration-rule underline-offset-4 transition-colors hover:decoration-ink"
          >
            {copy.banner.button}
          </button>
        </p>
      </div>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="gap-0 p-0 sm:max-w-xl">
          <div className="border-b border-rule px-6 pt-6 pb-4">
            <DialogTitle className="pr-8 font-display text-xl font-semibold leading-snug tracking-[-0.01em] text-ink">
              {copy.title}
            </DialogTitle>
            <DialogDescription className="mt-1 text-ink-muted">
              {copy.intro}
            </DialogDescription>
          </div>

          <div className="space-y-5 px-6 py-5 text-sm leading-relaxed text-ink">
            {copy.sections.map((section, i) => {
              const [firstParagraph, ...moreParagraphs] = (section.paragraphs ?? [])
                .map(fill)
                .filter((p): p is string => p !== null);
              const bar = section.splitBar;
              const barCaption = bar ? fill(bar.caption) : null;
              return (
                <section key={i} aria-labelledby={`aip-guide-s${i}`}>
                  <h3
                    id={`aip-guide-s${i}`}
                    className="font-display text-base font-semibold text-ink"
                  >
                    {section.heading}
                  </h3>

                  {section.items && (
                    <dl className="mt-2 space-y-2">
                      {section.items.map((item) => {
                        const text = fill(item.text);
                        return text ? (
                          <div key={item.term}>
                            <dt className="font-medium">{item.term}</dt>
                            <dd className="text-ink-muted">{text}</dd>
                          </div>
                        ) : null;
                      })}
                    </dl>
                  )}

                  {firstParagraph && <p className="mt-2 text-ink-muted">{firstParagraph}</p>}

                  {/* Illustrative only (FR-006): proportions are not data, so the bar
                      is one labelled image, not a figure table. */}
                  {bar && barCaption && (
                    <div
                      role="img"
                      aria-label={fill(bar.ariaLabel) ?? undefined}
                      className="mt-3 rounded-md border border-rule bg-paper-raised p-3"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                        <span className="font-medium text-ink">{barCaption}</span>
                        <span className="text-ink-faint">{bar.note}</span>
                      </div>
                      <div className="mt-2 flex h-6 overflow-hidden rounded text-[0.6875rem] font-medium">
                        <span className="flex w-[70%] items-center bg-ink px-2 text-paper">
                          {bar.fixed}
                        </span>
                        <span className="flex w-[30%] items-center bg-paper-deep px-2 text-ink">
                          {bar.allocable}
                        </span>
                      </div>
                    </div>
                  )}

                  {moreParagraphs.map((p) => (
                    <p key={p} className="mt-2 text-ink-muted">
                      {p}
                    </p>
                  ))}

                  {section.link && (
                    <p className="mt-2 text-ink-muted">
                      {section.link.text}{' '}
                      <LocaleLink
                        href={section.link.href}
                        className="font-medium text-ink underline decoration-rule underline-offset-4 hover:decoration-ink"
                      >
                        {section.link.label}
                      </LocaleLink>
                    </p>
                  )}
                </section>
              );
            })}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-rule px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-ink-faint">{copy.reopenHint}</p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="inline-flex min-h-[2.75rem] shrink-0 items-center justify-center whitespace-nowrap rounded-full bg-ink px-5 text-sm font-medium text-paper transition-opacity hover:opacity-90"
            >
              {copy.close}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
