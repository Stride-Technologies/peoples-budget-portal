'use client';

import { ThumbsUp, ThumbsDown, Minus } from 'lucide-react';
import { formatCurrency, addDecimalStrings } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import PublicPpmpLineItemsTable from '@/components/public/public-ppmp-line-items-table';
import { PublicFeedbackForm } from '@/components/public/public-feedback-form';
import type {
  PublicPpmpRecord,
  PpmpHistoryEntry,
  PublicPpmpFeedbackItem,
  ProgramFeedbackCategory,
  ProgramCommentSentiment,
} from '@/lib/api';

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

function Section({ title, children }: Readonly<{ title: string; children: React.ReactNode }>) {
  return (
    <div className="py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function DetailRow({ label, children }: Readonly<{ label: string; children: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function SentimentIcon({ sentiment }: Readonly<{ sentiment: string | null }>) {
  if (sentiment === 'POSITIVE') return <ThumbsUp className="h-3 w-3 text-green-500" />;
  if (sentiment === 'NEGATIVE') return <ThumbsDown className="h-3 w-3 text-red-500" />;
  if (sentiment === 'NEUTRAL') return <Minus className="h-3 w-3 text-slate-400" />;
  return null;
}

const CATEGORY_LABELS: Record<string, string> = {
  GENERAL: 'General inquiry',
  SUGGESTION: 'Recommend a program',
  CONCERN: 'Raise a concern',
  OTHER: 'Others',
};

/** Sum of `lineTotal` for line items in one expense class, as a decimal string. */
function sumByExpenseClass(
  lineItems: PublicPpmpRecord['lineItems'],
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO',
): string {
  return addDecimalStrings(
    lineItems.filter((li) => li.expenseClass === expenseClass).map((li) => li.lineTotal),
  );
}

/**
 * The sectioned "Project Overview" body — Details, Budget Summary, Line
 * Items, History of Changes, and Public Feedback — shared between the full
 * public page (`public-ppmp-detail-view.tsx`, `/ppmp/[year]/plan/[id]`) and the
 * in-place drawer (`public-ppmp-drawer.tsx`, opened from `/ppmp`'s list) so
 * the two surfaces can't drift into two different "Project Overview"
 * experiences. No Description/Expected Output/Remarks sections — those
 * used to be read live off the linked Program, which PPMP.fundingProgram
 * replaced with free text (see that field's schema comment); there's no
 * more structured source to show there.
 */
export default function PublicPpmpOverviewSections({
  ppmp,
  history,
  feedbackItems,
  onSubmitFeedback,
  onFeedbackSubmitted,
}: Readonly<{
  ppmp: PublicPpmpRecord;
  history: PpmpHistoryEntry[];
  feedbackItems: PublicPpmpFeedbackItem[];
  onSubmitFeedback: (dto: {
    submitterName?: string;
    submitterEmail?: string;
    message: string;
    category?: ProgramFeedbackCategory;
    sentiment?: ProgramCommentSentiment;
    recaptchaToken: string;
    website?: string;
  }) => Promise<{ success: boolean } | { error: string }>;
  onFeedbackSubmitted?: () => void;
}>) {
  const psTotal = sumByExpenseClass(ppmp.lineItems, 'PS');
  const mooeTotal = sumByExpenseClass(ppmp.lineItems, 'MOOE');
  const feTotal = sumByExpenseClass(ppmp.lineItems, 'FE');
  const coTotal = sumByExpenseClass(ppmp.lineItems, 'CO');

  return (
    <div className="space-y-0 divide-y divide-slate-100">
      <div className="px-5">
        <Section title="Details">
          <dl>
            <DetailRow label="Implementing Office">
              {ppmp.office.acronym} — {ppmp.office.name}
            </DetailRow>
            <DetailRow label="AIP Cycle">AIP {ppmp.aipCycle.fiscalYear}</DetailRow>
            <DetailRow label="Funding AIP Program">{ppmp.fundingProgram}</DetailRow>
            <DetailRow label="Line Items">{ppmp.lineItems.length}</DetailRow>
          </dl>
        </Section>
      </div>

      <div className="px-5">
        <Section title="Budget Summary">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'PS', value: psTotal },
              { label: 'MOOE', value: mooeTotal },
              ...(Number(feTotal) > 0 ? [{ label: 'FE', value: feTotal }] : []),
              { label: 'CO', value: coTotal },
              {
                label: 'Estimated Budget / Authorized Budgetary Allocation (PhP)',
                value: ppmp.grandTotal,
                highlight: true,
              },
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

      <div className="px-5">
        <Section title={`Line Items (${ppmp.lineItems.length})`}>
          <PublicPpmpLineItemsTable lineItems={ppmp.lineItems} />
        </Section>
      </div>

      <div className="px-5">
        <Section title="History of Changes">
          {history.length === 0 ? (
            <p className="text-sm italic text-slate-400">No history recorded yet.</p>
          ) : (
            <ol className="space-y-2 border-l border-slate-200 pl-4">
              {history.map((entry) => (
                <li key={entry.id} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-slate-300" />
                  <span className="text-slate-700">{entry.summary}</span>{' '}
                  <span className="text-xs text-slate-400" title={new Date(entry.at).toLocaleString()}>
                    · {formatRelative(entry.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Section>
      </div>

      <div className="px-5">
        <Section title={`Public Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}`}>
          <PublicFeedbackForm onSubmit={onSubmitFeedback} onSuccess={onFeedbackSubmitted} />

          {feedbackItems.length === 0 ? (
            <p className="mt-4 text-sm italic text-slate-400">
              No public feedback yet. Be the first to leave a comment.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              {feedbackItems.map((item) => (
                <div key={item.id} className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <SentimentIcon sentiment={item.sentiment} />
                      <span className="truncate text-xs font-medium text-slate-800">
                        {item.submitterName}
                      </span>
                      {item.category && (
                        <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-xs text-slate-400" title={new Date(item.createdAt).toLocaleString()}>
                      {formatRelative(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{item.message}</p>
                  {item.officialReply && (
                    <div className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
                        Official reply
                      </p>
                      <p className="mt-0.5">{item.officialReply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
