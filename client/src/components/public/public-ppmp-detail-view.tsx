'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import PublicPpmpOverviewSections from '@/components/public/public-ppmp-overview-sections';
import { submitProjectFeedback, loadPublicPpmpFeedback } from '@/app/(public)/ppmp/_actions';
import type { PublicPpmpRecord, PpmpHistoryEntry, PublicPpmpFeedbackItem } from '@/lib/api';

export default function PublicPpmpDetailView({
  ppmp,
  backHref,
  initialHistory,
  initialFeedback,
}: Readonly<{
  ppmp: PublicPpmpRecord;
  /** The year's Browse tab — the masthead above already names the section. */
  backHref: string;
  initialHistory: PpmpHistoryEntry[];
  initialFeedback: PublicPpmpFeedbackItem[];
}>) {
  const [feedbackItems, setFeedbackItems] = useState<PublicPpmpFeedbackItem[]>(initialFeedback);

  const refreshFeedback = async () => {
    const result = await loadPublicPpmpFeedback(ppmp.id);
    if (!('error' in result)) setFeedbackItems(result);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href={backHref}
        className="inline-flex min-h-11 items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> All plans for {ppmp.aipCycle.fiscalYear}
      </Link>

      <header className="mt-4 mb-8">
        <p className="font-mono text-[0.625rem] uppercase tracking-[0.18em] text-ink-faint">
          {ppmp.office.acronym} · {ppmp.office.name}
        </p>
        <h2 className="mt-3 max-w-[48rem] font-display text-[clamp(1.5rem,1.1rem+1.6vw,2.25rem)] font-medium leading-tight tracking-[-0.03em] text-ink">
          {ppmp.name}
        </h2>
        <p className="mt-2 text-sm text-ink-muted">
          Published {new Date(ppmp.publishedAt).toLocaleDateString('en-PH', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-rule bg-paper-raised shadow-sm">
        <PublicPpmpOverviewSections
          ppmp={ppmp}
          history={initialHistory}
          feedbackItems={feedbackItems}
          onSubmitFeedback={(dto) => submitProjectFeedback(ppmp.id, dto)}
          onFeedbackSubmitted={() => void refreshFeedback()}
        />
      </div>
    </div>
  );
}
