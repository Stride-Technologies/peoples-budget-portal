'use client';

import { useState, useCallback } from 'react';
import { fundName, programFunds } from '@/lib/fund-labels';
import { History, MessageSquare, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/currency-formatter';
import { cn } from '@/lib/utils';
import { VersionHistoryDrawer } from './version-history-drawer';
import { PublicFeedbackForm } from './public-feedback-form';
import { ArchivedNotice } from './archived-notice';
import type { PublicProgramDetail, PublicProjectActivity, PublicFeedbackItem } from '@/lib/api';
import { loadPublicFeedback, submitPublicFeedback } from '@/app/(public)/budget/_actions';
import { ThematicTagBadges } from './thematic-tag-badge';
import { SpecialFundBadges } from './special-fund-badges';
import { GOAL } from '@/lib/goal-label';


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

function formatAbsolute(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatMonthYear(month?: number | null, year?: number | null): string {
  if (month == null || year == null) return '—';
  return `${MONTH_NAMES[month - 1] ?? ''} ${year}`.trim();
}

function formatImplementationPeriod(program: PublicProgramDetail): string {
  const start = formatMonthYear(program.implementationStartMonth, program.implementationStartYear);
  const end = formatMonthYear(program.implementationEndMonth, program.implementationEndYear);
  if (start === '—' && end === '—') return '—';
  if (start === '—') return `Until ${end}`;
  if (end === '—') return `From ${start}`;
  return `${start} – ${end}`;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2 py-1.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="text-sm text-slate-900">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">{title}</h3>
      {children}
    </div>
  );
}

function PATypeBadge({ type }: { type: string }) {
  const isProject = type === 'PROJECT';
  return (
    <span
      className={cn(
        'shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap',
        isProject
          ? 'bg-green-50 text-green-700 border-green-200'
          : 'bg-orange-50 text-orange-700 border-orange-200',
      )}
    >
      {isProject ? 'Project' : 'Activity'}
    </span>
  );
}

function PARow({ pa, subItems, programId }: { pa: PublicProjectActivity; subItems: PublicProjectActivity[]; programId: string }) {
  const displayAmount = pa.proposedBudget ?? pa.grandTotal;

  return (
    <div className="rounded-md border border-slate-200 bg-white">
      <Link
        href={`/budget/${programId}/${pa.id}`}
        className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors"
      >
        <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        {/* One line from `sm`; below that the name gets its own line. */}
        <span className="flex flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 basis-full font-medium text-slate-800 sm:basis-0 sm:flex-1">{pa.name}</span>
          <PATypeBadge type={pa.type} />
          <span className="ml-auto font-mono text-xs tabular-nums text-slate-600 sm:ml-0">{formatCurrency(displayAmount)}</span>
        </span>
      </Link>
      {subItems.length > 0 && (
        <div className="divide-y divide-slate-100 border-t border-slate-100">
          {subItems.map((child) => (
            <Link
              key={child.id}
              href={`/budget/${programId}/${child.id}`}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 pl-9 text-sm hover:bg-slate-50 transition-colors"
            >
              <span className="min-w-0 basis-full text-slate-700 sm:basis-0 sm:flex-1">{child.name}</span>
              <PATypeBadge type={child.type} />
              <span className="ml-auto font-mono text-xs tabular-nums text-slate-600 sm:ml-0">
                {formatCurrency(child.proposedBudget ?? child.grandTotal)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  program: PublicProgramDetail;
  initialFeedback: PublicFeedbackItem[];
  programId: string;
  /** "Estimated Cost" or "Appropriation" (`AMOUNT_LABEL`). */
  amountLabel: string;
}

export function PublicProgramDetailView({ program, initialFeedback, programId, amountLabel }: Props) {
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackItems, setFeedbackItems] = useState<PublicFeedbackItem[]>(initialFeedback);
  const [feedbackLoading, setFeedbackLoading] = useState(false);

  const refreshFeedback = useCallback(async () => {
    setFeedbackLoading(true);
    const result = await loadPublicFeedback(programId);
    setFeedbackLoading(false);
    if (!('error' in result)) setFeedbackItems(result);
  }, [programId]);

  const implementingParty = program.office
    ? program.office.acronym
      ? `${program.office.acronym} — ${program.office.name}`
      : program.office.name
    : '—';

  const topLevelPAs = program.projectActivities.filter((pa) => !pa.parentProjectActivityId);
  // The headline budget before line-item breakdown — read, never re-derived.
  // Summing the root PAs shows ₱0.00 for a program that states its own costs,
  // because it holds no PAs at all.
  const proposedTotal = String(program.proposedTotal ?? '0.00');
  const hasLineItems = (parseFloat(program.grandTotal) || 0) > 0;

  return (
    <>
      {/* Header */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold leading-snug text-slate-900">{program.name}</h2>
        <p className="mt-0.5 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-500">
          {program.aipReferenceCode ?? program.tentativeAipReferenceCode}
          <SpecialFundBadges funds={program.fundSources} />
        </p>
        {program.lastUpdatedAt && (
          <p className="mt-1 text-xs text-slate-400">Last updated {formatAbsolute(program.lastUpdatedAt)}</p>
        )}
        {program.archived && <ArchivedNotice archived={program.archived} />}
        {(program.thematicTags ?? []).length > 0 && (
          <div className="mt-3">
            <ThematicTagBadges tags={program.thematicTags ?? []} />
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
          {!program.archived && (
          <Button
            variant={feedbackOpen ? 'default' : 'outline'}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setFeedbackOpen((o) => !o)}
          >
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            Leave Feedback
            {feedbackItems.length > 0 && (
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                {feedbackItems.length}
              </span>
            )}
          </Button>
          )}
        </div>

        {feedbackOpen && !program.archived && (
          <div className="mt-4">
            <PublicFeedbackForm
              onSubmit={(dto) => submitPublicFeedback(programId, dto)}
              onSuccess={() => {
                setFeedbackOpen(false);
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
              <DetailRow label="Implementing Office">{implementingParty}</DetailRow>
              <DetailRow label={GOAL}>{program.finishLine?.name ?? '—'}</DetailRow>
              <DetailRow label="Fund Sources">
                {programFunds(program).length > 0 ? (
                  <ul className="space-y-0.5">
                    {programFunds(program).map((f) => (
                      <li key={f}>{fundName(f)}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="italic text-slate-500">Not stated</span>
                )}
              </DetailRow>
              {program.subFinishLine && (
                <DetailRow label={`Sub-${GOAL}`}>{program.subFinishLine.name}</DetailRow>
              )}
              {program.papSector && (
                <DetailRow label="PAP Sector">{program.papSector.code} — {program.papSector.name}</DetailRow>
              )}
              <DetailRow label="AIP Cycle">AIP {program.aipCycle.fiscalYear}</DetailRow>
              <DetailRow label="Implementation">{formatImplementationPeriod(program)}</DetailRow>
              {program.supportingOffices.length > 0 && (
                <DetailRow label="Supporting Offices">
                  <ul className="space-y-0.5">
                    {program.supportingOffices.map((so) => (
                      <li key={so.office.id}>
                        {so.office.acronym
                          ? `${so.office.acronym} — ${so.office.name}`
                          : so.office.name}
                      </li>
                    ))}
                  </ul>
                </DetailRow>
              )}
            </dl>
          </Section>
        </div>

        <div className="px-5">
          <Section title="Description">
            {program.description ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{program.description}</p>
            ) : (
              <p className="text-sm italic text-slate-400">No description provided.</p>
            )}
          </Section>
        </div>

        <div className="px-5">
          <Section title="Expected Output / MFO">
            {program.expectedOutput ? (
              <p className="whitespace-pre-wrap text-sm text-slate-700">{program.expectedOutput}</p>
            ) : (
              <p className="text-sm italic text-slate-500">Not yet stated.</p>
            )}
          </Section>
        </div>

        {program.remarks && (
          <div className="px-5">
            <Section title="Remarks">
              <p className="whitespace-pre-wrap text-sm text-slate-700">{program.remarks}</p>
            </Section>
          </div>
        )}

        <div className="px-5">
          <Section title="Amount by Expense Class">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'PS', value: program.psTotal },
                { label: 'MOOE', value: program.mooeTotal },
                ...(Number(program.feTotal ?? 0) > 0 ? [{ label: 'FE', value: program.feTotal }] : []),
                { label: 'CO', value: program.coTotal },
                {
                  label: hasLineItems ? 'Grand Total' : amountLabel,
                  value: hasLineItems ? program.grandTotal : proposedTotal,
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

        {topLevelPAs.length > 0 && (
          <div className="px-5">
            <Section title={`Projects & Activities (${program.projectActivities.length})`}>
              <div className="space-y-2">
                {topLevelPAs.map((pa) => (
                  <PARow
                    key={pa.id}
                    pa={pa}
                    subItems={program.projectActivities.filter((c) => c.parentProjectActivityId === pa.id)}
                    programId={programId}
                  />
                ))}
              </div>
            </Section>
          </div>
        )}

        <div className="px-5">
          <Section title={`Public Feedback${feedbackItems.length > 0 ? ` (${feedbackItems.length})` : ''}`}>
            {feedbackLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="animate-pulse space-y-1 rounded-md border border-slate-100 p-3">
                    <div className="h-3 w-1/3 rounded bg-slate-200" />
                    <div className="h-3 w-full rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : feedbackItems.length === 0 ? (
              <p className="text-sm italic text-slate-400">
                No public feedback yet. Be the first to leave a comment.
              </p>
            ) : (
              <div className="space-y-3">
                {feedbackItems.map((item) => {
                  const { author, message } = parseFeedback(item.content);
                  return (
                    <div key={item.id} className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-800">{author}</span>
                        <span className="text-xs text-slate-400" title={new Date(item.createdAt).toLocaleString()}>
                          {formatRelative(item.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{message}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </div>
      </div>

      <VersionHistoryDrawer
        programId={program.id}
        programName={program.name}
        amountLabel={amountLabel}
        isOpen={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
      />
    </>
  );
}
