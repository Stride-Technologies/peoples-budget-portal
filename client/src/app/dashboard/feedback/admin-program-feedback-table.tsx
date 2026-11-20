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
import { CheckCircle2, Clock, CalendarDays, User, Trash2, ArchiveRestore } from 'lucide-react';
import { SimpleSelect } from '@/components/custom/simple-select';
import type { ProgramFeedbackListResponse, ProgramFeedbackRecord } from '@/lib/api';
import { deleteProgramFeedback, restoreProgramFeedback } from './_actions';
import { PublicProgramDrawer } from '@/components/public/public-program-drawer';

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

const DELETED_TAB = { key: 'deleted', label: 'Hidden' } as const;

type FilterKey = 'all' | 'pending' | 'reviewed' | 'deleted';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

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

function ReviewStatusCell({ item }: { item: ProgramFeedbackRecord }) {
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

interface AdminProgramFeedbackTableProps {
  data: ProgramFeedbackListResponse;
  currentLimit: number;
  currentFilter: FilterKey;
  canDelete: boolean;
  canViewDeleted: boolean;
  /** The list came back empty because the API refused it, not because it is empty. */
  accessDenied?: boolean;
}

export default function AdminProgramFeedbackTable({
  data,
  currentLimit,
  currentFilter,
  canDelete,
  canViewDeleted,
  accessDenied,
}: Readonly<AdminProgramFeedbackTableProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [selected, setSelected] = useState<ProgramFeedbackRecord | null>(null);
  const [isPending, startTransition] = useTransition();
  const [programDrawerId, setProgramDrawerId] = useState<string | null>(null);

  const { items, total, page } = data;
  const totalPages = Math.max(1, Math.ceil(total / currentLimit));

  function navigate(params: Record<string, string>) {
    const qs = new URLSearchParams();
    qs.set('tab', 'program');
    qs.set('page', String(page));
    qs.set('limit', String(currentLimit));
    qs.set('filter', currentFilter);
    Object.entries(params).forEach(([k, v]) => qs.set(k, v));
    router.push(`${pathname}?${qs.toString()}`);
  }

  function goToPage(p: number, lim = currentLimit) {
    navigate({ page: String(p), limit: String(lim) });
  }

  function changeFilter(f: FilterKey) {
    navigate({ filter: f, page: '1' });
  }

  function changeLimit(lim: number) {
    navigate({ limit: String(lim), page: '1' });
  }

  function handleDelete() {
    if (!selected) return;
    const id = selected.id;
    startTransition(async () => {
      try {
        await deleteProgramFeedback(id);
        toast.success('Feedback hidden. You can unhide it from the Hidden tab.');
        setSelected(null);
        // If we just removed the last row on a non-first page, step back a page
        // so the user doesn't land on an empty page.
        if (items.length === 1 && page > 1) {
          navigate({ page: String(page - 1) });
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
        await restoreProgramFeedback(id);
        toast.success('Feedback unhidden.');
        setSelected(null);
        if (items.length === 1 && page > 1) {
          navigate({ page: String(page - 1) });
        } else {
          router.refresh();
        }
      } catch {
        toast.error('Failed to restore feedback. Please try again.');
      }
    });
  }

  const drawerSubmitter = selected ? parseSubmitter(selected.content) : null;

  return (
    <>
      <div>
        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-neutral-200">
          {(canViewDeleted ? [...TABS, DELETED_TAB] : TABS).map((tab) => (
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
            message={`No ${currentFilter === 'pending' ? 'unreviewed' : currentFilter === 'reviewed' ? 'reviewed' : currentFilter === 'deleted' ? 'hidden' : ''} program feedback found.`}
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
                    const type = TYPE_BADGE[item.targetType];
                    return (
                      <TableRow key={item.id} className="align-top transition-colors">
                        <TableCell
                          className="py-3 text-xs text-neutral-500 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => setSelected(item)}
                        >
                          <p>{formatDateOnly(item.createdAt)}</p>
                          <p className="text-neutral-400">{formatTimeOnly(item.createdAt)}</p>
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => setSelected(item)}
                        >
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium mb-1 ${type?.className ?? 'bg-neutral-100 text-neutral-500'}`}>
                            {type?.label ?? item.targetType}
                          </span>
                          <p className="font-medium text-sm text-neutral-900 leading-snug break-words">
                            {item.program.name}
                          </p>
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal break-words cursor-pointer hover:bg-neutral-50"
                          onClick={() => setSelected(item)}
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
                          onClick={() => setSelected(item)}
                        >
                          <ReviewStatusCell item={item} />
                        </TableCell>
                        <TableCell
                          className="py-3 whitespace-normal cursor-pointer hover:bg-neutral-50"
                          onClick={() => setSelected(item)}
                        >
                          <p className="text-sm text-neutral-600 leading-relaxed break-words line-clamp-2" title={body}>{body}</p>
                        </TableCell>
                        <TableCell className="py-3 whitespace-normal">
                          <button
                            onClick={() => setSelected(item)}
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

      {/* Detail sheet */}
      <Sheet open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {selected && drawerSubmitter && (() => {
            const type = TYPE_BADGE[selected.targetType];
            const isReviewed = !!selected.resolvedAt;
            const reviewerName = selected.resolvedBy
              ? `${selected.resolvedBy.firstName} ${selected.resolvedBy.lastName}`
              : null;
            return (
              <>
                <SheetHeader className="pb-4 border-b border-neutral-100">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium w-fit ${type?.className ?? 'bg-neutral-100 text-neutral-500'}`}>
                    {type?.label ?? selected.targetType}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      selected.budgetItemId
                        ? window.open(`/budget/${selected.program.id}`, '_blank', 'noopener')
                        : setProgramDrawerId(selected.program.id)
                    }
                    className="text-left mt-2 hover:underline focus:outline-none"
                  >
                    <SheetTitle className="text-base font-semibold text-neutral-900 leading-snug">
                      {selected.program.name}
                    </SheetTitle>
                  </button>
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

                  {currentFilter !== 'deleted' && (
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Review</p>
                    {isReviewed ? (
                      <div className="rounded-lg border border-green-100 bg-green-50 px-4 py-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm text-green-700 font-medium">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          Reviewed
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
                      <div className="flex items-center gap-1 text-xs text-neutral-400">
                        <Clock className="w-3.5 h-3.5" />
                        Pending review by the proponent office
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
                              This hides the public comment from the program page for
                              everyone. It stays in the record and can be unhidden from the Hidden tab.
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
                        This feedback is deleted and hidden from the public program page.
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
                        This feedback is deleted and hidden from the public program
                        page. Only a super-admin can restore it.
                      </p>
                    </div>
                  )}
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
