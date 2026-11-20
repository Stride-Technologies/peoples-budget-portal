'use client';

import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import FeedbackEmptyState from './empty-state';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { CheckCircle2, Clock, CalendarDays, User, RotateCcw, ExternalLink, Pencil, Trash2, MessageSquarePlus } from 'lucide-react';
import { SimpleSelect } from '@/components/custom/simple-select';
import type { LguFeedbackListResponse, LguFeedbackRecord } from '@/lib/api';
import { reviewFeedback, unreviewFeedback, setFeedbackReply, deleteFeedbackReply } from './_actions';
import { PublicProgramDrawer } from '@/components/public/public-program-drawer';
import { BrandText } from '@/components/brand/brand-text';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  HEAD_REVIEWED: 'Head Reviewed',
  PENDING_ENDORSEMENT: 'Pending Endorsement',
  ENDORSED: 'Endorsed',
  PENDING_APPROVAL: 'Pending Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FOR_REVISION: 'For Revision',
  ARCHIVED: 'Archived',
  ENACTED: 'Enacted',
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: 'bg-neutral-100 text-neutral-500',
  SUBMITTED: 'bg-cyan-100 text-cyan-700',
  HEAD_REVIEWED: 'bg-amber-100 text-amber-700',
  PENDING_ENDORSEMENT: 'bg-violet-100 text-violet-600',
  ENDORSED: 'bg-violet-100 text-violet-700',
  PENDING_APPROVAL: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
  FOR_REVISION: 'bg-orange-100 text-orange-700',
  ENACTED: 'bg-green-100 text-green-700',
};

const TYPE_BADGE: Record<string, { label: string; className: string }> = {
  PROGRAM: { label: 'Program', className: 'bg-blue-100 text-blue-700' },
  PROJECT_ACTIVITY: { label: 'Program Activity', className: 'bg-green-100 text-green-700' },
  LINE_ITEM: { label: 'Project', className: 'bg-slate-100 text-slate-600' },
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Unreviewed' },
  { key: 'reviewed', label: 'Reviewed' },
] as const;

function parseSubmitter(content: string): { name: string; email: string | null; body: string } {
  const match = content.match(/^\[From: (.+?)\]\s*\n\n([\s\S]*)$/);
  if (match) {
    const raw = match[1];
    const emailMatch = raw.match(/^(.+?)\s*<([^>]+)>$/);
    if (emailMatch) return { name: emailMatch[1].trim(), email: emailMatch[2], body: match[2] };
    return { name: raw, email: null, body: match[2] };
  }
  return { name: 'Anonymous', email: null, body: content };
}

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const range = new Set<number>([1, total]);
  for (let i = Math.max(2, current - 2); i <= Math.min(total - 1, current + 2); i++) range.add(i);
  const sorted = [...range].sort((a, b) => a - b);
  const result: (number | '...')[] = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) result.push('...');
  }
  return result;
}

function formatDateOnly(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(iso));
}

function formatTimeOnly(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(new Date(iso));
}

function ReviewStatusCell({ item }: { item: LguFeedbackRecord }) {
  if (item.resolvedAt) {
    const reviewer = item.resolvedBy
      ? `${item.resolvedBy.firstName} ${item.resolvedBy.lastName}`
      : 'Staff';
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Reviewed</span>
        </div>
        <p className="text-xs text-neutral-400 pl-5">{reviewer}</p>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-xs text-neutral-400">
      <Clock className="w-3.5 h-3.5" />
      Pending
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function FeedbackTable({
  initialData,
  cycleId,
  limit: currentLimit,
  filter: currentFilter,
  accessDenied,
}: {
  initialData: LguFeedbackListResponse;
  cycleId: string;
  limit: number;
  filter: 'all' | 'pending' | 'reviewed';
  /** The list came back empty because the API refused it, not because it is empty. */
  accessDenied?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<LguFeedbackRecord | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const [replyText, setReplyText] = useState('');
  const [replyEditMode, setReplyEditMode] = useState(false);
  const [isReplyPending, startReplyTransition] = useTransition();

  const [programDrawerId, setProgramDrawerId] = useState<string | null>(null);

  const { items, total, page } = initialData;
  const totalPages = Math.max(1, Math.ceil(total / currentLimit));

  function navigate(params: Record<string, string>) {
    const qs = new URLSearchParams();
    qs.set('tab', 'program');
    qs.set('cycleId', cycleId);
    qs.set('page', String(page));
    qs.set('limit', String(currentLimit));
    qs.set('filter', currentFilter);
    Object.entries(params).forEach(([k, v]) => qs.set(k, v));
    router.push(`${pathname}?${qs.toString()}`);
  }

  function goToPage(p: number, lim = currentLimit) {
    navigate({ page: String(p), limit: String(lim) });
  }

  function changeFilter(f: 'all' | 'pending' | 'reviewed') {
    navigate({ filter: f, page: '1' });
  }

  function changeLimit(lim: number) {
    navigate({ limit: String(lim), page: '1' });
  }

  function openDrawer(item: LguFeedbackRecord) {
    setSelected(item);
    setNote('');
    setReplyText('');
    setReplyEditMode(false);
  }

  function handleReview() {
    if (!selected) return;
    const id = selected.id;
    const noteText = note.trim() || undefined;
    startTransition(async () => {
      const result = await reviewFeedback(id, noteText);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, resolvedAt: result.resolvedAt, resolvedBy: result.resolvedBy, resolveNote: result.resolveNote }
          : prev,
      );
      setNote('');
      router.refresh();
    });
  }

  function handleUnreview() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      await unreviewFeedback(id);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, resolvedAt: null, resolvedBy: null, resolveNote: null }
          : prev,
      );
      router.refresh();
    });
  }

  function handlePostReply() {
    if (!selected || !replyText.trim()) return;
    const id = selected.id;
    const content = replyText.trim();
    startReplyTransition(async () => {
      const result = await setFeedbackReply(id, content);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, officialReply: result.officialReply, officialRepliedAt: result.officialRepliedAt, officialReplyEditedAt: result.officialReplyEditedAt }
          : prev,
      );
      setReplyText('');
      setReplyEditMode(false);
      router.refresh();
    });
  }

  function handleDeleteReply() {
    if (!selected) return;
    const id = selected.id;
    startReplyTransition(async () => {
      await deleteFeedbackReply(id);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, officialReply: null, officialRepliedAt: null, officialReplyEditedAt: null }
          : prev,
      );
      router.refresh();
    });
  }

  function startEdit() {
    if (!selected?.officialReply) return;
    setReplyText(selected.officialReply);
    setReplyEditMode(true);
  }

  const drawerSubmitter = selected ? parseSubmitter(selected.content) : null;

  return (
    <>
      <div>
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => changeFilter(tab.key)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                currentFilter === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          <FeedbackEmptyState
            accessDenied={accessDenied}
            message={`No ${currentFilter === 'pending' ? 'unreviewed' : currentFilter === 'reviewed' ? 'reviewed' : ''} feedback found for this cycle.`}
          />
        ) : (
          <>
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-neutral-50">
                    <TableHead className="w-[110px]">Date & Time</TableHead>
                    <TableHead className="w-[26%] whitespace-normal">Program / Activity / Project</TableHead>
                    <TableHead className="w-[150px]">Name & Email</TableHead>
                    <TableHead className="w-[120px]">Status</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const { name, email, body } = parseSubmitter(item.content);
                    const ref = item.program.aipReferenceCode ?? item.program.tentativeAipReferenceCode;
                    const type = TYPE_BADGE[item.targetType];
                    const isReviewed = !!item.resolvedAt;
                    return (
                      <TableRow
                        key={item.id}
                        className="align-top transition-colors"
                      >
                        <TableCell
                          className="py-3 text-xs text-neutral-500 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => openDrawer(item)}
                        >
                          <p>{formatDateOnly(item.createdAt)}</p>
                          <p className="text-neutral-400">{formatTimeOnly(item.createdAt)}</p>
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => openDrawer(item)}
                        >
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mb-1 ${type?.className ?? 'bg-neutral-100 text-neutral-500'}`}>
                            {type?.label ?? item.targetType}
                          </span>
                          <p className="font-medium text-sm text-neutral-900 leading-snug break-words">
                            {item.program.name}
                          </p>
                          {ref && <p className="text-xs text-neutral-400 mt-0.5 font-mono break-all">{ref}</p>}
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal break-words cursor-pointer hover:bg-neutral-50"
                          onClick={() => openDrawer(item)}
                        >
                          {name !== 'Anonymous' ? (
                            <>
                              <p className="text-sm text-neutral-700">{name}</p>
                              {email && <p className="text-xs text-neutral-400 mt-0.5 break-all">{email}</p>}
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400 italic">Anonymous</span>
                          )}
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => openDrawer(item)}
                        >
                          <ReviewStatusCell item={item} />
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => openDrawer(item)}
                        >
                          <p className="text-sm text-neutral-600 leading-relaxed break-words line-clamp-2" title={body}>{body}</p>
                        </TableCell>
                        <TableCell className="py-3 whitespace-normal">
                          <button
                            onClick={() => openDrawer(item)}
                            className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                          >
                            View
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between mt-4 text-sm text-neutral-500">
              <div className="flex items-center gap-3">
                <span>
                  {(page - 1) * currentLimit + 1}–{Math.min(page * currentLimit, total)} of {total}
                </span>
                <span className="flex items-center gap-1.5">
                  Rows per page:
                  <SimpleSelect
                    aria-label="Rows per page"
                    size="sm"
                    className="h-7 w-auto px-2 text-xs"
                    options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                    value={String(currentLimit)}
                    onChange={(next) => changeLimit(Number(next))}
                  />
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded text-xs hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                {getPageNumbers(page, totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`ellipsis-${i}`} className="w-7 text-center text-xs text-neutral-400">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p)}
                      className={`w-7 h-7 rounded text-xs font-medium ${
                        p === page ? 'bg-blue-600 text-white' : 'hover:bg-neutral-100 text-neutral-600'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded text-xs hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) { setSelected(null); setNote(''); setReplyText(''); setReplyEditMode(false); } }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && drawerSubmitter && (() => {
            const ref = selected.program.aipReferenceCode ?? selected.program.tentativeAipReferenceCode;
            const type = TYPE_BADGE[selected.targetType];
            const statusCls = STATUS_BADGE[selected.program.status] ?? 'bg-neutral-100 text-neutral-500';
            const isReviewed = !!selected.resolvedAt;
            const reviewerName = selected.resolvedBy
              ? `${selected.resolvedBy.firstName} ${selected.resolvedBy.lastName}`
              : null;
            const hasReply = !!selected.officialReply;

            return (
              <>
                <SheetHeader className="pb-4 border-b border-neutral-100">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${type?.className ?? 'bg-neutral-100 text-neutral-500'}`}>
                      {type?.label ?? selected.targetType}
                    </span>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCls}`}>
                      {STATUS_LABEL[selected.program.status] ?? selected.program.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      selected.budgetItemId
                        ? window.open(`/budget/${selected.program.id}`, '_blank', 'noopener')
                        : setProgramDrawerId(selected.program.id)
                    }
                    className="group flex items-start gap-1.5 text-left mt-2 hover:underline focus:outline-none"
                  >
                    <SheetTitle className="text-base font-semibold text-neutral-900 leading-snug">
                      {selected.program.name}
                    </SheetTitle>
                    <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 text-neutral-400 group-hover:text-blue-500 transition-colors" />
                  </button>
                  {ref && (
                    <SheetDescription className="text-xs text-neutral-400 font-mono mt-0.5">
                      {ref}
                    </SheetDescription>
                  )}
                </SheetHeader>

                <div className="px-4 py-5 space-y-5">
                  <div className="flex items-start gap-4 text-xs text-neutral-500">
                    <span className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {drawerSubmitter.name}
                        {drawerSubmitter.email && (
                          <span className="text-neutral-400 ml-1">&lt;{drawerSubmitter.email}&gt;</span>
                        )}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                      {new Date(selected.createdAt).toLocaleDateString('en-PH', {
                        month: 'long', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide mb-2">Message</p>
                    <p className="text-sm text-neutral-800 leading-relaxed whitespace-pre-wrap">
                      {drawerSubmitter.body}
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Public Reply</p>

                    {hasReply && !replyEditMode ? (
                      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-blue-900 leading-relaxed whitespace-pre-wrap flex-1">
                            {selected.officialReply}
                          </p>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={startEdit}
                              disabled={isReplyPending}
                              className="p-1 rounded text-neutral-400 hover:text-blue-600 hover:bg-blue-100 disabled:opacity-50 transition-colors"
                              title="Edit reply"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={handleDeleteReply}
                              disabled={isReplyPending}
                              className="p-1 rounded text-neutral-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                              title="Delete reply"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                        <p className="text-xs text-blue-500">
                          LGU <BrandText field="placeName" />
                          {selected.officialReplyEditedAt && (
                            <> · Edited {new Date(selected.officialReplyEditedAt).toLocaleDateString('en-PH', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })}</>
                          )}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Write a public reply visible to constituents on the program page…"
                          rows={3}
                          maxLength={2000}
                          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handlePostReply}
                            disabled={isReplyPending || !replyText.trim()}
                            className="flex-1 flex items-center justify-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
                          >
                            <MessageSquarePlus className="h-4 w-4" />
                            {isReplyPending ? 'Saving…' : replyEditMode ? 'Save Reply' : 'Post Public Reply'}
                          </button>
                          {replyEditMode && (
                            <button
                              onClick={() => { setReplyEditMode(false); setReplyText(''); }}
                              disabled={isReplyPending}
                              className="px-3 py-2 rounded-md border border-neutral-200 text-sm text-neutral-600 hover:bg-neutral-50 disabled:opacity-50 transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Review</p>

                    {isReviewed ? (
                      <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            Reviewed
                          </div>
                          <button
                            onClick={handleUnreview}
                            disabled={isPending}
                            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Undo
                          </button>
                        </div>
                        <p className="text-xs text-green-600">
                          {new Date(selected.resolvedAt!).toLocaleDateString('en-PH', {
                            month: 'long', day: 'numeric', year: 'numeric',
                          })}
                          {reviewerName && ` · by ${reviewerName}`}
                        </p>
                        {selected.resolveNote && (
                          <p className="text-xs text-neutral-600 mt-1 italic">{selected.resolveNote}</p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Internal note (optional)"
                          rows={3}
                          className="w-full rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-300"
                        />
                        <button
                          onClick={handleReview}
                          disabled={isPending}
                          className="w-full flex items-center justify-center gap-2 rounded-md bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 transition-colors"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {isPending ? 'Saving…' : 'Mark as Reviewed'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </SheetContent>
      </Sheet>

      <PublicProgramDrawer
        programId={programDrawerId}
        onClose={() => setProgramDrawerId(null)}
      />
    </>
  );
}
