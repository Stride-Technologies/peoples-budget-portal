'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PpmpFeedbackRecord } from '@/lib/api';
import { loadPpmpFeedback, replyToPpmpFeedback } from '@/app/ppmp-registry/[id]/_actions';

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FeedbackRow({
  feedback,
  onReply,
}: Readonly<{
  feedback: PpmpFeedbackRecord;
  onReply: (id: string, reply: string) => Promise<void>;
}>) {
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState('');
  const [posting, setPosting] = useState(false);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-800">
          {feedback.submitterName ?? 'Anonymous resident'}
        </span>
        <span>·</span>
        <span>{formatAt(feedback.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-800">{feedback.message}</p>

      {feedback.officialReply ? (
        <div className="mt-2 rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-600">
            Official reply
          </p>
          <p className="mt-0.5">{feedback.officialReply}</p>
        </div>
      ) : replying ? (
        <div className="mt-2 flex items-center gap-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Write an official reply…"
          />
          <Button
            size="sm"
            disabled={posting || !reply.trim()}
            onClick={async () => {
              setPosting(true);
              await onReply(feedback.id, reply.trim());
              setPosting(false);
            }}
          >
            {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setReplying(true)}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Reply officially
        </button>
      )}
    </div>
  );
}

/** Feedback submitted by residents specifically about this Project. */
export default function ProjectFeedbackTab({ ppmpId }: Readonly<{ ppmpId: string }>) {
  const [items, setItems] = useState<PpmpFeedbackRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  // No synchronous `setLoading(true)` here — see project-comments-tab.tsx's
  // comment on the same pattern (avoids `react-hooks/set-state-in-effect`).
  const refresh = () => {
    loadPpmpFeedback(ppmpId).then((result) => {
      if ('error' in result) setError(result.error);
      else setItems(result.data);
      setLoading(false);
    });
  };

  useEffect(refresh, [ppmpId]);

  const handleReply = async (feedbackId: string, reply: string) => {
    const result = await replyToPpmpFeedback(ppmpId, feedbackId, reply);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    refresh();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      {items.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
          No public feedback on this Project yet.
        </p>
      ) : (
        items.map((fb) => (
          <FeedbackRow key={fb.id} feedback={fb} onReply={handleReply} />
        ))
      )}
    </div>
  );
}
