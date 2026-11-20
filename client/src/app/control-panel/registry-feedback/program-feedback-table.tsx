'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ProgramFeedbackListResponse } from '@/lib/api';
import { apiReviewProgramFeedback } from '@/lib/api';

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function ReviewRow({
  item,
  canAct,
  token,
  onReviewed,
}: {
  item: ProgramFeedbackListResponse['items'][number];
  canAct: boolean;
  token: string;
  onReviewed: (id: string) => void;
}) {
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleReview() {
    startTransition(async () => {
      try {
        await apiReviewProgramFeedback(token, item.id, { internalNote: note || undefined });
        onReviewed(item.id);
      } catch {
        toast.error('Failed to mark as reviewed. Please try again.');
      }
    });
  }

  if (item.resolvedAt) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-green-700">
        <CheckCircle2 className="w-3.5 h-3.5" />
        <span>
          Reviewed by {item.resolvedBy ? `${item.resolvedBy.firstName} ${item.resolvedBy.lastName}` : 'staff'} on {formatDate(item.resolvedAt)}
        </span>
        {item.resolveNote && (
          <span className="text-neutral-500 ml-1 italic">— {item.resolveNote}</span>
        )}
      </div>
    );
  }

  if (!canAct) {
    return (
      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <Clock className="w-3.5 h-3.5" />
        Pending review
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {showNote && (
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional internal note..."
          rows={2}
          className="w-full text-xs rounded border border-neutral-300 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
        />
      )}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1"
          disabled={isPending}
          onClick={handleReview}
        >
          <CheckCircle2 className="w-3 h-3" />
          {isPending ? 'Reviewing…' : 'Mark reviewed'}
        </Button>
        <button
          onClick={() => setShowNote((v) => !v)}
          className="text-xs text-neutral-500 hover:text-neutral-700 underline"
        >
          {showNote ? 'Hide note' : 'Add note'}
        </button>
      </div>
    </div>
  );
}

interface ProgramFeedbackTableProps {
  data: ProgramFeedbackListResponse;
  currentPage: number;
  showReviewed: boolean;
  canAct: boolean;
  token: string;
}

export default function ProgramFeedbackTable({
  data,
  currentPage,
  showReviewed,
  canAct,
  token,
}: Readonly<ProgramFeedbackTableProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  function navigate(params: Record<string, string | undefined>) {
    const qs = new URLSearchParams();
    const merged = {
      tab: 'program',
      page: String(currentPage),
      reviewed: String(showReviewed),
      ...params,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    router.push(`${pathname}?${qs.toString()}`);
  }

  const visibleItems = data.items.filter((i) => !hiddenIds.has(i.id));
  const totalPages = Math.max(1, Math.ceil(data.total / data.limit));

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={() => navigate({ reviewed: showReviewed ? 'false' : 'true', page: '1' })}
          className={`h-9 px-3 rounded-md border text-sm font-medium transition-colors ${
            showReviewed
              ? 'border-green-500 bg-green-50 text-green-700'
              : 'border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-50'
          }`}
        >
          {showReviewed ? 'Showing reviewed' : 'Show reviewed'}
        </button>

        <span className="text-sm text-neutral-500 ml-auto">
          {data.total} submission{data.total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-36">Date</TableHead>
              <TableHead className="w-48">Program</TableHead>
              <TableHead className="w-24">Type</TableHead>
              <TableHead className="w-40">Name</TableHead>
              <TableHead className="w-48">Email</TableHead>
              <TableHead>Feedback</TableHead>
              <TableHead className="w-56">Review</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-400">
                  {showReviewed ? 'No reviewed submissions.' : 'No unreviewed submissions.'}
                </TableCell>
              </TableRow>
            ) : (
              visibleItems.map((item) => (
                <TableRow key={item.id} className={item.resolvedAt ? 'opacity-60' : ''}>
                  <TableCell className="text-xs text-neutral-500 whitespace-nowrap">
                    {formatDate(item.createdAt)}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-700">
                    <a
                      href={`/registry/${item.program.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 hover:text-blue-600 hover:underline"
                    >
                      <span className="line-clamp-2">{item.program.name}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.targetType === 'PROJECT_ACTIVITY' ? 'outline' : 'secondary'}>
                      {item.targetType === 'PROJECT_ACTIVITY' ? 'PA' : 'Program'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-neutral-700">
                    {item.submitterName ?? <span className="text-neutral-400 italic">Anonymous</span>}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-600">
                    {item.submitterEmail ?? <span className="text-neutral-400">—</span>}
                  </TableCell>
                  <TableCell className="text-sm text-neutral-800 max-w-sm">
                    <p className="line-clamp-3 whitespace-pre-wrap">{item.content}</p>
                  </TableCell>
                  <TableCell>
                    <ReviewRow
                      item={item}
                      canAct={canAct}
                      token={token}
                      onReviewed={(id) => {
                        if (!showReviewed) setHiddenIds((s) => new Set([...s, id]));
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-neutral-500">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage <= 1}
              onClick={() => navigate({ page: String(currentPage - 1) })}
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="sr-only">Previous page</span>
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={currentPage >= totalPages}
              onClick={() => navigate({ page: String(currentPage + 1) })}
            >
              <ChevronRight className="w-4 h-4" />
              <span className="sr-only">Next page</span>
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
