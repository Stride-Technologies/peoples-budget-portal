'use client';

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import PublicPpmpOverviewSections from '@/components/public/public-ppmp-overview-sections';
import {
  loadPublicPpmp,
  loadPublicPpmpHistory,
  loadPublicPpmpFeedback,
  submitProjectFeedback,
} from '@/app/(public)/ppmp/_actions';
import type { PublicPpmpRecord, PpmpHistoryEntry, PublicPpmpFeedbackItem } from '@/lib/api';

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function DrawerSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6">
      <div className="space-y-2">
        <div className="h-4 w-2/3 rounded bg-slate-200" />
        <div className="h-3 w-1/2 rounded bg-slate-200" />
        <div className="h-3 w-1/3 rounded bg-slate-200" />
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 rounded-lg bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

interface PublicPpmpDrawerProps {
  ppmpId: string | null;
  onClose: () => void;
  onFeedbackSubmitted?: (ppmpId: string) => void;
}

const DRAWER_WIDTH = 1100;

/**
 * In-place "Project Overview" for the public PPMP list — mirrors
 * public-program-drawer.tsx's Sheet shell exactly, so opening a Project from
 * `/ppmp` behaves the same as opening a Program from `/aip`: a slide-over,
 * not a page redirect. `/ppmp/[year]/plan/[id]` (public-ppmp-detail-view.tsx) still
 * exists as the shareable/SEO full-page route — same dual pattern AIP uses
 * for `/aip/[programId]` alongside this drawer.
 */
export function PublicPpmpDrawer({ ppmpId, onClose, onFeedbackSubmitted }: PublicPpmpDrawerProps) {
  const [ppmp, setPpmp] = useState<PublicPpmpRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PpmpHistoryEntry[]>([]);
  const [feedbackItems, setFeedbackItems] = useState<PublicPpmpFeedbackItem[]>([]);

  const refreshFeedback = useCallback(async (id: string) => {
    const result = await loadPublicPpmpFeedback(id);
    if (!('error' in result)) setFeedbackItems(result);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!ppmpId) {
        setPpmp(null);
        setError(null);
        setHistory([]);
        setFeedbackItems([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      const [result, historyResult, feedbackResult] = await Promise.all([
        loadPublicPpmp(ppmpId),
        loadPublicPpmpHistory(ppmpId),
        loadPublicPpmpFeedback(ppmpId),
      ]);
      if (cancelled) return;
      setIsLoading(false);
      if ('error' in result) {
        setError(result.error);
      } else {
        setPpmp(result);
      }
      setHistory(Array.isArray(historyResult) ? historyResult : []);
      setFeedbackItems(Array.isArray(feedbackResult) ? feedbackResult : []);
    })();
    return () => { cancelled = true; };
  }, [ppmpId]);

  return (
    <Sheet open={!!ppmpId} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        className="flex flex-col p-0"
        style={{ width: `min(${DRAWER_WIDTH}px, 100vw)`, maxWidth: 'none' }}
        showCloseButton={false}
      >
        <div className="shrink-0 flex items-center justify-between bg-blue-600 px-6 py-4">
          <span className="text-xs font-bold uppercase tracking-widest text-blue-100">
            Project Overview
          </span>
          <button
            onClick={onClose}
            className="rounded p-1 text-blue-200 hover:bg-blue-700 hover:text-white"
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <div className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
          {isLoading ? (
            <div className="animate-pulse space-y-2">
              <div className="h-5 w-3/4 rounded bg-slate-200" />
              <div className="h-3.5 w-40 rounded bg-slate-200" />
            </div>
          ) : ppmp ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {ppmp.office.acronym} — {ppmp.office.name} · FY {ppmp.aipCycle.fiscalYear}
              </p>
              <h2 className="text-lg font-semibold leading-snug text-slate-900">{ppmp.name}</h2>
              <p className="mt-0.5 text-[11px] tracking-tight text-slate-400">
                {ppmp.fundingProgram}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Published {formatAbsolute(ppmp.publishedAt)}
              </p>
            </>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-50">
          {isLoading ? (
            <DrawerSkeleton />
          ) : error ? (
            <div className="flex items-center justify-center py-20 text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : ppmp ? (
            <div className="bg-white">
              <PublicPpmpOverviewSections
                ppmp={ppmp}
                history={history}
                feedbackItems={feedbackItems}
                onSubmitFeedback={(dto) => submitProjectFeedback(ppmp.id, dto)}
                onFeedbackSubmitted={() => {
                  void refreshFeedback(ppmp.id);
                  onFeedbackSubmitted?.(ppmp.id);
                }}
              />
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
