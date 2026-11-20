"use client"

import { useState, useEffect, useReducer, useTransition } from "react"
import {
  MessageSquare, Loader2, Trash2, CornerDownRight, CheckCircle2, RotateCcw, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ProgramComment, CreateCommentPayload, ActivityEvent, CommentActor } from "@/lib/api"

const ROLE_LABEL: Record<string, string> = {
  STAFF: "Staff",
  HEAD: "Head",
  SUPER_ADMIN: "Admin",
}

const STAGE_LABEL: Record<string, string> = {
  SECTOR_FEEDBACK: "Sector feedback",
  HEAD_REVIEW: "Head review",
  ENDORSEMENT: "Endorsement",
  APPROVAL: "Approval",
  GENERAL: "Comment",
  PUBLIC_FEEDBACK: "Public feedback",
}

export function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ActorLine({ actor, at }: { actor?: CommentActor | null; at: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-xs font-semibold text-slate-800">
        {actor?.name ?? "Unknown user"}
      </span>
      {actor?.office && (
        <span className="text-[10px] text-slate-500">· {actor.office}</span>
      )}
      {actor?.role && (
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          · {ROLE_LABEL[actor.role] ?? actor.role}
        </span>
      )}
      <span className="text-[10px] text-slate-400">· {at}</span>
    </div>
  )
}

function CommentThread({
  comment,
  currentUserId,
  busy,
  paName,
  onOpenPa,
  onReply,
  onResolve,
  onDelete,
}: {
  comment: ProgramComment
  currentUserId?: string
  busy: boolean
  paName?: string
  onOpenPa?: () => void
  onReply?: (parentId: string, content: string) => void
  onResolve?: (commentId: string, resolved: boolean, note?: string) => void
  onDelete?: (commentId: string) => void
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [resolveNoteOpen, setResolveNoteOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState("")
  const resolved = !!comment.resolvedAt
  const replies = comment.replies ?? []

  const submitReply = () => {
    if (!onReply || !replyText.trim()) return
    onReply(comment.id, replyText.trim())
    setReplyText("")
    setReplyOpen(false)
  }

  const handleResolveClick = () => {
    if (resolved) {
      // Reopening — no note needed
      onResolve?.(comment.id, false)
    } else {
      setResolveNoteOpen(true)
    }
  }

  const confirmResolve = () => {
    onResolve?.(comment.id, true, resolveNote.trim() || undefined)
    setResolveNoteOpen(false)
    setResolveNote("")
  }

  const cancelResolve = () => {
    setResolveNoteOpen(false)
    setResolveNote("")
  }

  return (
    <div
      className={cn(
        "rounded-md border px-2.5 py-2",
        resolved ? "border-emerald-100 bg-emerald-50/40" : "border-slate-100 bg-white",
      )}
    >
      {/* PA context pill */}
      {paName && (
        <div className="mb-1.5 flex items-center gap-1">
          <span className="rounded bg-green-50 border border-green-200 px-1.5 py-0.5 text-[9px] font-medium text-green-700">
            PA
          </span>
          {onOpenPa ? (
            <button
              type="button"
              onClick={onOpenPa}
              className="flex items-center gap-0.5 text-[10px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
            >
              {paName}
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          ) : (
            <span className="text-[10px] font-medium text-slate-600">{paName}</span>
          )}
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <ActorLine actor={comment.author} at={formatAt(comment.createdAt)} />
        <div className="flex items-center gap-1.5">
          {comment.stage && comment.stage !== 'PUBLIC_FEEDBACK' && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
              {STAGE_LABEL[comment.stage] ?? comment.stage}
            </span>
          )}
          {comment.stage === 'PUBLIC_FEEDBACK' && (
            <span className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-blue-600">
              Public
            </span>
          )}
          {currentUserId && comment.authorUserId === currentUserId && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(comment.id)}
              className="text-slate-300 transition-colors hover:text-red-500"
              title="Delete comment"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
        {comment.content}
      </p>

      {resolved && (
        <div className="mt-1">
          <p className="flex items-center gap-1 text-[10px] text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Resolved{comment.resolvedBy ? ` by ${comment.resolvedBy.name}` : ""}
          </p>
          {comment.resolveNote && (
            <p className="mt-0.5 pl-4 text-[10px] italic text-emerald-700">{comment.resolveNote}</p>
          )}
        </div>
      )}

      {replies.length > 0 && (
        <div className="mt-2 space-y-2 border-l-2 border-slate-100 pl-2.5">
          {replies.map((reply) => (
            <div key={reply.id}>
              <div className="flex items-center gap-1">
                <CornerDownRight className="h-3 w-3 shrink-0 text-slate-300" />
                <ActorLine actor={reply.author} at={formatAt(reply.createdAt)} />
              </div>
              <p className="ml-4 mt-0.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                {reply.content}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-1.5 flex items-center gap-3">
        {onReply && (
          <button
            type="button"
            onClick={() => setReplyOpen((v) => !v)}
            className="text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            Reply
          </button>
        )}
        {onResolve && !resolveNoteOpen && (
          <button
            type="button"
            disabled={busy}
            onClick={handleResolveClick}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium transition-colors disabled:opacity-50",
              resolved
                ? "text-slate-500 hover:text-slate-800"
                : "text-emerald-600 hover:text-emerald-800",
            )}
          >
            {resolved ? (
              <><RotateCcw className="h-3 w-3" /> Reopen</>
            ) : (
              <><CheckCircle2 className="h-3 w-3" /> Resolve</>
            )}
          </button>
        )}
      </div>

      {resolveNoteOpen && (
        <div className="mt-2 space-y-1.5">
          <Textarea
            placeholder="Resolution note (optional) — how was this addressed?"
            value={resolveNote}
            onChange={(e) => setResolveNote(e.target.value)}
            className="min-h-[44px] resize-none text-xs"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={cancelResolve}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 px-2.5 text-[10px] bg-emerald-600 hover:bg-emerald-700"
              disabled={busy}
              onClick={confirmResolve}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Mark Resolved'}
            </Button>
          </div>
        </div>
      )}

      {replyOpen && onReply && (
        <div className="mt-2">
          <Textarea
            placeholder="Write a reply…"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[48px] resize-none text-xs"
          />
          <div className="mt-1.5 flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              onClick={() => { setReplyOpen(false); setReplyText("") }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-6 px-2.5 text-[10px]"
              disabled={!replyText.trim() || busy}
              onClick={submitReply}
            >
              Reply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Activity stream & threaded comment section.
 * Pass `entityId` as the program ID or project-activity ID depending on context.
 * The callbacks receive `entityId` as their first argument.
 */
export function ActivitySection({
  entityId,
  currentUserId,
  loadActivityStream,
  postComment,
  canComment = true,
  deleteComment,
  resolveComment,
  activityRefreshKey,
  onUnresolvedCountChange,
  paLookup,
  onOpenPa,
}: {
  entityId: string
  currentUserId?: string
  loadActivityStream?: (id: string) => Promise<{ events: ActivityEvent[] } | { error: string }>
  postComment?: (id: string, payload: CreateCommentPayload) => Promise<{ comment: ProgramComment } | { error: string }>
  /** Composer visibility — the caller (PA drawer) checks program-level permission. */
  canComment?: boolean
  deleteComment?: (commentId: string) => Promise<{ success: string } | { error: string }>
  resolveComment?: (commentId: string, resolved: boolean, note?: string, reply?: string) => Promise<{ comment: ProgramComment } | { error: string }>
  activityRefreshKey?: number
  onUnresolvedCountChange?: (count: number) => void
  /** Optional PA title lookup used to show context on PA-targeted comments */
  paLookup?: Map<string, string>
  /** Called when the user clicks a PA link; receives the PA id */
  onOpenPa?: (paId: string) => void
}) {
  type StreamState = { events: ActivityEvent[]; loading: boolean; error: string | null }
  type StreamAction =
    | { type: 'loaded'; events: ActivityEvent[] }
    | { type: 'failed'; error: string }
  function streamReducer(prev: StreamState, action: StreamAction): StreamState {
    if (action.type === 'loaded') return { events: action.events, loading: false, error: null }
    return { events: prev.events, loading: false, error: action.error }
  }
  const [{ events, loading, error }, dispatch] = useReducer(streamReducer, {
    events: [],
    loading: !!loadActivityStream,
    error: null,
  })
  const [commentText, setCommentText] = useState('')
  const [busy, startWork] = useTransition()

  const refresh = async () => {
    if (!loadActivityStream) return
    const fresh = await loadActivityStream(entityId)
    if ('events' in fresh) dispatch({ type: 'loaded', events: fresh.events })
  }

  useEffect(() => {
    if (!loadActivityStream) return
    let cancelled = false
    loadActivityStream(entityId)
      .then((r) => {
        if (cancelled) return
        if ('error' in r) dispatch({ type: 'failed', error: r.error })
        else dispatch({ type: 'loaded', events: r.events })
      })
      .catch(() => { if (!cancelled) dispatch({ type: 'failed', error: 'Failed to load activity.' }) })
    return () => { cancelled = true }
  }, [entityId, loadActivityStream, activityRefreshKey])

  const unresolvedCount = events.filter(
    (e) => e.kind === 'comment' && !(e.payload as { resolvedAt?: string | null }).resolvedAt,
  ).length
  useEffect(() => {
    onUnresolvedCountChange?.(unresolvedCount)
  }, [unresolvedCount, onUnresolvedCountChange])

  const handlePost = () => {
    if (!postComment || !commentText.trim()) return
    const content = commentText.trim()
    startWork(async () => {
      const r = await postComment(entityId, { content })
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      setCommentText('')
      await refresh()
    })
  }

  const handleReply = (parentId: string, content: string) => {
    if (!postComment) return
    startWork(async () => {
      const r = await postComment(entityId, { content, parentCommentId: parentId })
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  const handleResolve = (commentId: string, resolved: boolean, note?: string) => {
    if (!resolveComment) return
    startWork(async () => {
      const r = await resolveComment(commentId, resolved, note)
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  const handleDelete = (commentId: string) => {
    if (!deleteComment) return
    startWork(async () => {
      const r = await deleteComment(commentId)
      if ('error' in r) { dispatch({ type: 'failed', error: r.error }); return }
      await refresh()
    })
  }

  if (!loadActivityStream) return null

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Activity &amp; Comments</span>
        {unresolvedCount > 0 && (
          <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {unresolvedCount} open
          </span>
        )}
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto px-3 py-2">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {!loading && events.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-400">No activity yet.</p>
        )}
        {events.map((ev, i) => {
          if (ev.kind !== 'comment') return null
          const c = ev.payload as unknown as ProgramComment
          const paName = c.targetType === 'PROJECT_ACTIVITY' && c.targetId
            ? (paLookup?.get(c.targetId) ?? `PA ${c.targetId.slice(0, 8)}`)
            : undefined
          return (
            <CommentThread
              key={c.id ?? i}
              comment={c}
              currentUserId={currentUserId}
              busy={busy}
              paName={paName}
              onOpenPa={paName && onOpenPa ? () => onOpenPa(c.targetId!) : undefined}
              onReply={postComment ? handleReply : undefined}
              onResolve={resolveComment ? handleResolve : undefined}
              onDelete={deleteComment ? handleDelete : undefined}
            />
          )
        })}
        {!!error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>

      {postComment && canComment && (
        <div className="border-t border-slate-100 px-3 py-2.5">
          <Textarea
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="min-h-[60px] resize-none text-xs"
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              disabled={!commentText.trim() || busy}
              onClick={handlePost}
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
