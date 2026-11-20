'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
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
} from '@/components/ui/sheet';
import { CheckCircle2, Clock, CalendarDays, User, RotateCcw, Trash2, ArchiveRestore } from 'lucide-react';
import type { RegistryFeedbackListResponse, RegistryFeedbackRecord, RegistryFeedbackCategory } from '@/lib/api';
import { reviewGeneralFeedback, unreviewGeneralFeedback, deleteGeneralFeedback, restoreGeneralFeedback } from './_actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { GOAL } from '@/lib/goal-label';


const CATEGORY_LABELS: Record<RegistryFeedbackCategory, string> = {
  GENERAL: 'General',
  SPECIFIC_PPA: 'Specific PPA',
  BUDGET_TRANSPARENCY: 'Budget Transparency',
  FINISH_LINE_PROGRESS: `${GOAL} Progress`,
  OTHER: 'Other',
  PROGRAM_SUGGESTION: 'Program Suggestion',
};

const ALL_CATEGORIES: RegistryFeedbackCategory[] = [
  'GENERAL', 'SPECIFIC_PPA', 'BUDGET_TRANSPARENCY', 'FINISH_LINE_PROGRESS', 'OTHER', 'PROGRAM_SUGGESTION',
];

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Unreviewed' },
  { key: 'reviewed', label: 'Reviewed' },
] as const;

const DELETED_TAB = { key: 'deleted', label: 'Hidden' } as const;

type FilterKey = 'all' | 'pending' | 'reviewed' | 'deleted';

function formatDateOnly(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(iso));
}

function formatTimeOnly(iso: string) {
  return new Intl.DateTimeFormat('en-PH', { timeStyle: 'short' }).format(new Date(iso));
}


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

function ReviewStatusCell({ item }: { item: RegistryFeedbackRecord }) {
  if (item.reviewedAt) {
    const reviewer = item.reviewedBy
      ? `${item.reviewedBy.firstName} ${item.reviewedBy.lastName}`
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

interface GeneralFeedbackTableProps {
  data: RegistryFeedbackListResponse;
  currentCategory: string;
  currentPage: number;
  currentLimit: number;
  currentFilter: FilterKey;
  canAct: boolean;
  canDelete: boolean;
  /** The list came back empty because the API refused it, not because it is empty. */
  accessDenied?: boolean;
}

export default function GeneralFeedbackTable({
  data,
  currentCategory,
  currentPage,
  currentLimit,
  currentFilter,
  canAct,
  canDelete,
  accessDenied,
}: Readonly<GeneralFeedbackTableProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<RegistryFeedbackRecord | null>(null);
  const [note, setNote] = useState('');
  const [isPending, startTransition] = useTransition();

  const { items, total, page } = data;
  const totalPages = Math.max(1, Math.ceil(total / currentLimit));

  function navigate(params: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      tab: 'general',
      category: currentCategory || undefined,
      page: String(currentPage),
      limit: String(currentLimit),
      filter: currentFilter,
      ...params,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    router.push(`${pathname}?${qs.toString()}`);
  }

  function changeFilter(f: FilterKey) {
    navigate({ filter: f, page: '1' });
  }

  function goToPage(p: number, lim = currentLimit) {
    navigate({ page: String(p), limit: String(lim) });
  }

  function changeLimit(lim: number) {
    navigate({ limit: String(lim), page: '1' });
  }

  function openDrawer(item: RegistryFeedbackRecord) {
    setSelected(item);
    setNote('');
  }

  function handleReview() {
    if (!selected) return;
    const id = selected.id;
    const noteText = note.trim() || undefined;
    startTransition(async () => {
      const result = await reviewGeneralFeedback(id, noteText);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, reviewedAt: result.reviewedAt, reviewedBy: result.reviewedBy, internalNote: result.internalNote }
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
      await unreviewGeneralFeedback(id);
      setSelected((prev) =>
        prev?.id === id
          ? { ...prev, reviewedAt: null, reviewedBy: null, internalNote: null }
          : prev,
      );
      router.refresh();
    });
  }

  function handleDelete() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      try {
        await deleteGeneralFeedback(id);
        toast.success('Feedback hidden. You can unhide it from the Hidden tab.');
        setSelected(null);
        // Step back a page if we just emptied the current (non-first) page.
        if (items.length === 1 && currentPage > 1) {
          navigate({ page: String(currentPage - 1) });
        } else {
          router.refresh();
        }
      } catch {
        toast.error('Failed to delete feedback. Please try again.');
      }
    });
  }

  function handleRestore() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      try {
        await restoreGeneralFeedback(id);
        toast.success('Feedback unhidden.');
        setSelected(null);
        if (items.length === 1 && currentPage > 1) {
          navigate({ page: String(currentPage - 1) });
        } else {
          router.refresh();
        }
      } catch {
        toast.error('Failed to restore feedback. Please try again.');
      }
    });
  }

  return (
    <>
      <div>
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-end gap-3 mb-3">
          <Select
            value={currentCategory || 'all'}
            onValueChange={(v) => navigate({ category: v === 'all' ? undefined : (v ?? undefined), page: '1' })}
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <span className="min-w-0 flex-1 truncate text-left">
                {currentCategory ? (CATEGORY_LABELS[currentCategory as RegistryFeedbackCategory] ?? currentCategory) : 'All categories'}
              </span>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectItem value="all">All categories</SelectItem>
              {ALL_CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          {(canAct ? [...TABS, DELETED_TAB] : TABS).map((tab) => (
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
            message={`No ${currentFilter === 'pending' ? 'unreviewed' : currentFilter === 'reviewed' ? 'reviewed' : currentFilter === 'deleted' ? 'hidden' : ''} feedback found.`}
          />
        ) : (
          <>
            <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
              <Table className="table-fixed w-full">
                <TableHeader>
                  <TableRow className="bg-neutral-50">
                    <TableHead className="w-[110px]">Date & Time</TableHead>
                    <TableHead className="w-[150px]">Category</TableHead>
                    <TableHead className="w-[180px]">Name & Email</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="w-[70px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="align-top transition-colors">
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
                        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-neutral-100 text-neutral-600">
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                      </TableCell>
                      <TableCell
                        className="py-3 whitespace-normal break-words cursor-pointer hover:bg-neutral-50"
                        onClick={() => openDrawer(item)}
                      >
                        {item.submitterName ? (
                          <>
                            <p className="text-sm text-neutral-700">{item.submitterName}</p>
                            {item.submitterEmail && (
                              <p className="text-xs text-neutral-400 mt-0.5 break-all">{item.submitterEmail}</p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-neutral-400 italic">Anonymous</span>
                        )}
                      </TableCell>
                      <TableCell
                        className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                        onClick={() => openDrawer(item)}
                      >
                        <p className="text-sm text-neutral-600 leading-relaxed break-words line-clamp-2" title={item.message}>
                          {item.message}
                        </p>
                      </TableCell>
                      <TableCell
                        className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                        onClick={() => openDrawer(item)}
                      >
                        <ReviewStatusCell item={item} />
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
                  ))}
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
                  <Select
                    value={String(currentLimit)}
                    onValueChange={(v) => changeLimit(Number(v))}
                  >
                    <SelectTrigger size="sm" className="w-[70px]">
                      <span className="flex-1 text-left">{currentLimit}</span>
                    </SelectTrigger>
                    <SelectContent alignItemWithTrigger={false}>
                      {PAGE_SIZE_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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

      {/* Detail sheet */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => { if (!open) { setSelected(null); setNote(''); } }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && (
            <>
              <SheetHeader className="pb-4 border-b border-neutral-100">
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium bg-neutral-100 text-neutral-600 w-fit">
                  {CATEGORY_LABELS[selected.category] ?? selected.category}
                </span>
                <SheetTitle className="text-base font-semibold text-neutral-900 leading-snug mt-2">
                  General Feedback
                </SheetTitle>
              </SheetHeader>

              <div className="px-4 py-5 space-y-5">
                <div className="flex items-start gap-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    {selected.submitterName ?? 'Anonymous'}
                    {selected.submitterEmail && (
                      <span className="text-neutral-400">&lt;{selected.submitterEmail}&gt;</span>
                    )}
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
                    {selected.message}
                  </p>
                </div>

                {currentFilter !== 'deleted' && (
                <div className="space-y-3">
                  <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Review</p>

                  {selected.reviewedAt ? (
                    <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          Reviewed
                        </div>
                        {canAct && (
                          <button
                            onClick={handleUnreview}
                            disabled={isPending}
                            className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 disabled:opacity-50 transition-colors"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Undo
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-green-600">
                        {new Date(selected.reviewedAt).toLocaleDateString('en-PH', {
                          month: 'long', day: 'numeric', year: 'numeric',
                        })}
                        {selected.reviewedBy && ` · by ${selected.reviewedBy.firstName} ${selected.reviewedBy.lastName}`}
                      </p>
                      {selected.internalNote && (
                        <p className="text-xs text-neutral-600 mt-1 italic">{selected.internalNote}</p>
                      )}
                    </div>
                  ) : canAct ? (
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
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-neutral-400">
                      <Clock className="w-3.5 h-3.5" />
                      Pending review
                    </div>
                  )}
                </div>
                )}

                {canDelete && currentFilter !== 'deleted' && (
                  <div className="space-y-2 border-t border-neutral-100 pt-5">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Moderation</p>
                    <AlertDialog>
                      <AlertDialogTrigger
                        render={
                          <Button
                            variant="outline"
                            disabled={isPending}
                            className="w-full justify-center gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          />
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                        {isPending ? 'Hiding…' : 'Hide Feedback'}
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Hide this feedback?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This hides the submission from public and staff views. You
                            can unhide it later from the Hidden tab.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}

                {canDelete && currentFilter === 'deleted' && (
                  <div className="space-y-2 border-t border-neutral-100 pt-5">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Moderation</p>
                    <p className="text-xs text-neutral-500">
                      This feedback is deleted and hidden from public and staff views.
                    </p>
                    <Button
                      variant="outline"
                      disabled={isPending}
                      onClick={handleRestore}
                      className="w-full justify-center gap-2 border-blue-200 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      {isPending ? 'Unhiding…' : 'Unhide Feedback'}
                    </Button>
                  </div>
                )}

                {!canDelete && currentFilter === 'deleted' && (
                  <div className="space-y-2 border-t border-neutral-100 pt-5">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Moderation</p>
                    <p className="text-xs text-neutral-500">
                      This feedback is deleted and hidden from public and staff
                      views. Only a super-admin can restore it.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
