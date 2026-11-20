'use client';

import { useEffect, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { PpmpCommentRecord } from '@/lib/api';
import { loadPpmpComments, addPpmpComment } from '@/app/ppmp-registry/[id]/_actions';

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CommentBubble({
  comment,
  onReply,
}: Readonly<{ comment: PpmpCommentRecord; onReply?: () => void }>) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-800">
          {comment.author.firstName} {comment.author.lastName}
        </span>
        <span>·</span>
        <span>{formatAt(comment.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm text-slate-800">{comment.content}</p>
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
        >
          Reply
        </button>
      )}
    </div>
  );
}

/** Flat internal comment thread — one level of replies, no workflow gating. */
export default function ProjectCommentsTab({ ppmpId }: Readonly<{ ppmpId: string }>) {
  const [comments, setComments] = useState<PpmpCommentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [posting, setPosting] = useState(false);

  // No synchronous `setLoading(true)` here — `loading` already starts `true`,
  // and every state update below happens inside the `.then()` callback, so
  // nothing sets state synchronously within the effect body (avoids
  // `react-hooks/set-state-in-effect`, same reasoning as edit-history-tab.tsx).
  const refresh = () => {
    loadPpmpComments(ppmpId).then((result) => {
      if ('error' in result) setError(result.error);
      else setComments(result.data);
      setLoading(false);
    });
  };

  useEffect(refresh, [ppmpId]);

  const postRoot = async () => {
    if (!message.trim()) return;
    setPosting(true);
    const result = await addPpmpComment(ppmpId, message.trim());
    setPosting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setMessage('');
    refresh();
  };

  const postReply = async (parentCommentId: string) => {
    if (!replyMessage.trim()) return;
    setPosting(true);
    const result = await addPpmpComment(ppmpId, replyMessage.trim(), parentCommentId);
    setPosting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setReplyMessage('');
    setReplyTo(null);
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

      {comments.length === 0 ? (
        <p className="rounded-md border border-dashed border-slate-200 py-6 text-center text-sm text-slate-500">
          No comments yet.
        </p>
      ) : (
        <div className="space-y-3">
          {comments.map((c) => (
            <div key={c.id} className="space-y-2">
              <CommentBubble comment={c} onReply={() => setReplyTo(c.id)} />
              {(c.replies ?? []).map((r) => (
                <div key={r.id} className="ml-6">
                  <CommentBubble comment={r} />
                </div>
              ))}
              {replyTo === c.id && (
                <div className="ml-6 flex items-center gap-2">
                  <Textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    rows={1}
                    placeholder="Write a reply…"
                    className="text-sm"
                  />
                  <Button size="sm" onClick={() => void postReply(c.id)} disabled={posting}>
                    <Send className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          placeholder="Leave a comment for your team…"
        />
        <Button size="sm" onClick={() => void postRoot()} disabled={posting}>
          {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        </Button>
      </div>
    </div>
  );
}
