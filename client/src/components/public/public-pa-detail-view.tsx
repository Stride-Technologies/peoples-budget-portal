'use client';

import { useState, useCallback } from 'react';
import { History, MessageSquare, ChevronLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import { VersionHistoryDrawer } from './version-history-drawer';
import { PublicFeedbackForm } from './public-feedback-form';
import type { PublicProjectActivityDetail, PublicFeedbackItem, ThematicTagRef } from '@/lib/api';
import { loadPAPublicFeedback, submitPAPublicFeedback } from '@/app/(public)/budget/_actions';
import { ThematicTagBadges } from './thematic-tag-badge';
import { SpecialFundBadges } from './special-fund-badges';

/** Effective tags for public display: own ∪ inherited, indistinguishable (User Story 5). */
function effectiveTags(pa: PublicProjectActivityDetail): ThematicTagRef[] {
  const seen = new Set<string>();
  const all = [...(pa.thematicTags ?? []), ...(pa.inheritedThematicTags ?? [])];
  return all.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return '—';
  return `${MONTH_NAMES[month - 1] ?? ''} ${year}`.trim();
}

function parseFeedback(content: string): { author: string; message: string } {
  const match = /^\[From: ([^\]]+)\]\n\n([\s\S]*)$/.exec(content);
  if (match) return { author: match[1], message: match[2] };
  return { author: 'Anonymous', message: content };
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

interface Props {
  programId: string;
  programName: string;
  programCode: string;
  pa: PublicProjectActivityDetail;
  initialFeedback: PublicFeedbackItem[];
  /** "Estimated Cost" or "Appropriation" (`AMOUNT_LABEL`). */
  amountLabel: string;
}

export function PublicPADetailView({ programId, programName, programCode, pa, initialFeedback, amountLabel }: Props) {
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<PublicFeedbackItem[]>(initialFeedback);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFormOpen, setFeedbackFormOpen] = useState(false);
  const lineItems = pa.lineItems ?? [];
  const children = pa.children ?? [];

  const isProject = pa.type === 'PROJECT';
  const typeBadgeClass = isProject
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-orange-50 text-orange-700 border-orange-200';

  const implStart = formatMonthYear(pa.implementationStartMonth, pa.implementationStartYear);
  const implEnd = formatMonthYear(pa.implementationEndMonth, pa.implementationEndYear);
  const implPeriod =
    implStart && implEnd ? `${implStart} – ${implEnd}`
    : implStart || implEnd || '—';

  const refreshFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const result = await loadPAPublicFeedback(programId, pa.id);
    setFeedbackLoading(false);
    if (!('error' in result)) setFeedbackItems(result);
  }, [programId, pa.id]);

  return (
    <>
      {/* Back navigation */}
      <div className="mb-4">
        <Link
          href={`/budget/${programId}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to {programName}
        </Link>
      </div>

      {/* Header card */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-lg font-bold leading-snug text-slate-900">{pa.name}</h2>
          <span
            className={cn(
              'mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
              typeBadgeClass,
            )}
          >
            {isProject ? 'Project' : 'Activity'}
          </span>
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
          {programCode}
          <SpecialFundBadges funds={pa.fundSources} />
        </p>
        <p className="mt-0.5 text-xs text-slate-400">{programName}</p>
        {effectiveTags(pa).length > 0 && (
          <div className="mt-3">
            <ThematicTagBadges tags={effectiveTags(pa)} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={() => setVersionHistoryOpen(true)}
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            Version History
          </Button>
          <Button
            variant={feedbackFormOpen ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFeedbackFormOpen((o) => !o)}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Leave Feedback
          </Button>
        </div>

        {feedbackFormOpen && (
          <div className="mt-4">
            <PublicFeedbackForm
              onSubmit={(dto) => submitPAPublicFeedback(programId, pa.id, dto)}
              onSuccess={() => {
                setFeedbackFormOpen(false);
                void refreshFeedback();
              }}
            />
          </div>
        )}
      </div>

      {/* Detail sections */}
      <div className="space-y-0 rounded-xl border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
        <div className="px-5">
          <Section title="Administrative">
            <dl>
              <DetailRow label="Implementation">{implPeriod}</DetailRow>
              {pa.parent && (
                <DetailRow label="Parent Project">
                  <Link
                    href={`/budget/${programId}/${pa.parent.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {pa.parent.name}
                  </Link>
                </DetailRow>
              )}
            </dl>
          </Section>
        </div>

        {/* Always shown: a blank expected output reads "Not yet stated" rather
            than vanishing (specs/013 — the city's workbook leaves many blank). */}
        <div className="px-5">
          <Section title="Description">
            {pa.description && (
              <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700">{pa.description}</p>
            )}
            <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">
                Expected Output
              </p>
              {pa.expectedOutput ? (
                <p className="text-sm font-medium leading-6 text-blue-950">{pa.expectedOutput}</p>
              ) : (
                <p className="text-sm italic text-slate-500">Not yet stated.</p>
              )}
            </div>
          </Section>
        </div>

        <div className="px-5">
          <Section title="Amount by Expense Class">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'PS', value: pa.psTotal },
                { label: 'MOOE', value: pa.mooeTotal },
                ...(Number(pa.feTotal ?? 0) > 0 ? [{ label: 'FE', value: pa.feTotal }] : []),
                { label: 'CO', value: pa.coTotal },
                { label: lineItems.length > 0 ? 'Grand Total' : amountLabel, value: pa.proposedAmount, highlight: true },
              ].map(({ label, value, highlight }) => (
                <div
                  key={label}
                  className={cn(
                    'rounded-lg border px-3 py-2',
                    highlight ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-slate-50',
                  )}
                >
                  <p className={cn('text-xs font-medium', highlight ? 'text-blue-600' : 'text-slate-500')}>
                    {label}
                  </p>
                  <p className={cn('mt-0.5 text-sm font-semibold tabular-nums', highlight ? 'text-blue-900' : 'text-slate-900')}>
                    {formatCurrency(value)}
                  </p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {lineItems.length > 0 && (
          <div className="px-5">
            <Section title={`Line Items (${lineItems.length})`}>
              <div className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {lineItems.map((li) => (
                  <div key={li.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                          {li.expenseClass}
                        </span>
                        <span className="truncate text-slate-800">{li.uacsDescription}</span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-slate-400">{li.uacsCode}</p>
                      {li.quantity && li.unit && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {li.quantity} {li.unit} × {formatCurrency(li.unitCost)}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums text-slate-950">
                      {formatCurrency(li.lineTotal)}
                    </span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {children.length > 0 && (
          <div className="px-5">
            <Section title={`Sub-Activities (${children.length})`}>
              <div className="space-y-1.5">
                {children.map((child) => (
                  <Link
                    key={child.id}
                    href={`/budget/${programId}/${child.id}`}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5 rotate-180 text-slate-400" />
                    <span className="flex-1 font-medium text-slate-800">{child.name}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium',
                        child.type === 'PROJECT'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-orange-50 text-orange-700 border-orange-200',
                      )}
                    >
                      {child.type === 'PROJECT' ? 'Project' : 'Activity'}
                    </span>
                    <span className="font-mono text-xs tabular-nums text-slate-600">
                      {formatCurrency(child.proposedAmount)}
                    </span>
                  </Link>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* Feedback section */}
        <div className="px-5">
          <Section title={`Public Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}`}>
            {feedbackLoading ? (
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="animate-pulse rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 h-3 w-24 rounded bg-slate-200" />
                    <div className="h-4 w-full rounded bg-slate-100" />
                  </div>
                ))}
              </div>
            ) : feedbackItems.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <MessageCircle className="h-6 w-6 text-slate-300" />
                <p className="text-sm text-slate-400">No feedback yet. Be the first to share your thoughts.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {feedbackItems.map((item) => {
                  const { author, message } = parseFeedback(item.content);
                  return (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-700">{author}</span>
                        <span className="text-[10px] text-slate-400">{formatRelative(item.createdAt)}</span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      <VersionHistoryDrawer
        isOpen={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        programId={programId}
        programName={programName}
        amountLabel={amountLabel}
      />
    </>
  );
}
