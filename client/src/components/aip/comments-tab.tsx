"use client"

import { useState, useEffect, useReducer, useTransition } from "react"
import {
  MessageSquare, Loader2, Trash2, CornerDownRight, CheckCircle2, RotateCcw,
  ChevronDown, ChevronRight, ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { ProgramComment, CommentActor } from "@/lib/api"

// ─── Shared helpers ────────────────────────────────────────────────────────────

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

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
}

function ActorLine({ actor, at }: { actor?: CommentActor | null; at: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5">
      <span className="text-xs font-semibold text-slate-800">{actor?.name ?? "Unknown user"}</span>
      {actor?.office && <span className="text-[10px] text-slate-500">· {actor.office}</span>}
      {actor?.role && (
        <span className="text-[10px] uppercase tracking-wide text-slate-400">
          · {ROLE_LABEL[actor.role] ?? actor.role}
        </span>
      )}
      <span className="text-[10px] text-slate-400">· {at}</span>
    </div>
  )
}

function parseFeedbackContent(content: string): { author: string; message: string } {
  const match = /^\[From: ([^\]]+)\]\n\n([\s\S]*)$/.exec(content)
  if (match) return { author: match[1], message: match[2] }
  return { author: "Anonymous", message: content }
}

// ─── CommentThread ─────────────────────────────────────────────────────────────

function CommentThread({
  comment,
  currentUserId,
  busy,
  onReply,
  onResolve,
  onDelete,
}: {
  comment: ProgramComment
  currentUserId?: string
  busy: boolean
  onReply?: (parentId: string, content: string) => void
  onResolve?: (commentId: string, resolved: boolean, note?: string, reply?: string) => void
  onDelete?: (commentId: string) => void
}) {
  const [replyOpen, setReplyOpen] = useState(false)
  const [replyText, setReplyText] = useState("")
  const [resolveNoteOpen, setResolveNoteOpen] = useState(false)
  const [resolveNote, setResolveNote] = useState("")
  const [resolveReply, setResolveReply] = useState("")
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
      onResolve?.(comment.id, false)
    } else {
      setResolveNoteOpen(true)
    }
  }

  const confirmResolve = () => {
    // D10: the reply is posted as a real, visible reply in the thread, so the
    // commenter sees *what was done* rather than just that someone closed it.
    // The note stays what it was — metadata on the thread, not conversation.
    onResolve?.(
      comment.id,
      true,
      resolveNote.trim() || undefined,
      resolveReply.trim() || undefined,
    )
    setResolveNoteOpen(false)
    setResolveNote("")
    setResolveReply("")
  }

  return (
    <div className={cn(
      "rounded-md border px-2.5 py-2",
      resolved ? "border-emerald-100 bg-emerald-50/40" : "border-slate-100 bg-white",
    )}>
      <div className="flex items-start justify-between gap-2">
        <ActorLine actor={comment.author} at={formatAt(comment.createdAt)} />
        <div className="flex items-center gap-1.5">
          {comment.stage && comment.stage !== "PUBLIC_FEEDBACK" && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-slate-500">
              {STAGE_LABEL[comment.stage] ?? comment.stage}
            </span>
          )}
          {currentUserId && comment.authorUserId === currentUserId && onDelete && (
            <button type="button" onClick={() => onDelete(comment.id)}
              className="text-slate-300 transition-colors hover:text-red-500" title="Delete">
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">{comment.content}</p>

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
          <button type="button" onClick={() => setReplyOpen((v) => !v)}
            className="text-[10px] font-medium text-slate-500 transition-colors hover:text-slate-800">
            Reply
          </button>
        )}
        {onResolve && !resolveNoteOpen && (
          <button type="button" disabled={busy} onClick={handleResolveClick}
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium transition-colors disabled:opacity-50",
              resolved ? "text-slate-500 hover:text-slate-800" : "text-emerald-600 hover:text-emerald-800",
            )}>
            {resolved
              ? <><RotateCcw className="h-3 w-3" /> Reopen</>
              : <><CheckCircle2 className="h-3 w-3" /> Resolve</>}
          </button>
        )}
      </div>

      {resolveNoteOpen && (
        <div className="mt-2 space-y-2.5">
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-slate-700">
              Reply in thread{' '}
              <span className="font-normal text-slate-400">
                (optional — visible to everyone on this AIP)
              </span>
            </p>
            <Textarea
              placeholder="e.g. Split the kits line into two activities as suggested."
              value={resolveReply}
              onChange={(e) => setResolveReply(e.target.value)}
              className="min-h-[48px] resize-none text-xs"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-medium text-slate-700">
              Internal resolution note{' '}
              <span className="font-normal text-slate-400">
                (optional — not shown in the thread)
              </span>
            </p>
            <Textarea
              placeholder="e.g. Agreed with CBO on the 27 Jul coordination call"
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              className="min-h-[44px] resize-none text-xs"
              maxLength={500}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
              onClick={() => {
                setResolveNoteOpen(false)
                setResolveNote("")
                setResolveReply("")
              }}>
              Cancel
            </Button>
            <Button size="sm" className="h-6 px-2.5 text-[10px] bg-emerald-600 hover:bg-emerald-700"
              disabled={busy} onClick={confirmResolve}>
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Mark Resolved"}
            </Button>
          </div>
        </div>
      )}

      {replyOpen && onReply && (
        <div className="mt-2">
          <Textarea placeholder="Write a reply…" value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            className="min-h-[48px] resize-none text-xs" />
          <div className="mt-1.5 flex justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]"
              onClick={() => { setReplyOpen(false); setReplyText("") }}>Cancel</Button>
            <Button size="sm" className="h-6 px-2.5 text-[10px]"
              disabled={!replyText.trim() || busy} onClick={submitReply}>Reply</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ThreadGroup ───────────────────────────────────────────────────────────────

function ThreadGroup({
  label,
  color,
  threads,
  currentUserId,
  busy,
  onOpenTarget,
  onReply,
  onResolve,
  onDelete,
}: {
  label: string
  color: "blue" | "green" | "slate"
  threads: ProgramComment[]
  currentUserId?: string
  busy: boolean
  onOpenTarget?: () => void
  onReply?: (parentId: string, content: string) => void
  onResolve?: (commentId: string, resolved: boolean, note?: string, reply?: string) => void
  onDelete?: (commentId: string) => void
}) {
  const unresolved = threads.filter((t) => !t.resolvedAt)
  const resolved = threads.filter((t) => !!t.resolvedAt)
  const [showResolved, setShowResolved] = useState(false)

  const borderColor = color === "blue"
    ? "border-blue-200 bg-blue-50/50"
    : color === "green"
      ? "border-green-200 bg-green-50/50"
      : "border-slate-200 bg-slate-50/50"

  const labelColor = color === "blue"
    ? "text-blue-700"
    : color === "green"
      ? "text-green-700"
      : "text-slate-600"

  return (
    <div className={cn("rounded-md border p-2.5", borderColor)}>
      <div className="mb-2 flex items-center gap-2">
        {onOpenTarget ? (
          <button type="button" onClick={onOpenTarget}
            className={cn("flex items-center gap-1 text-xs font-semibold hover:underline", labelColor)}>
            {label}
            <ExternalLink className="h-3 w-3" />
          </button>
        ) : (
          <span className={cn("text-xs font-semibold", labelColor)}>{label}</span>
        )}
        {unresolved.length > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700">
            {unresolved.length} open
          </span>
        )}
        {resolved.length > 0 && (
          <span className="ml-auto rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500">
            {resolved.length} resolved
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        {unresolved.map((t) => (
          <CommentThread
            key={t.id}
            comment={t}
            currentUserId={currentUserId}
            busy={busy}
            onReply={onReply}
            onResolve={onResolve}
            onDelete={onDelete}
          />
        ))}

        {resolved.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowResolved((v) => !v)}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600"
            >
              {showResolved
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />}
              {showResolved ? "Hide" : "Show"} {resolved.length} resolved
            </button>
            {showResolved && (
              <div className="mt-1.5 space-y-1.5">
                {resolved.map((t) => (
                  <CommentThread
                    key={t.id}
                    comment={t}
                    currentUserId={currentUserId}
                    busy={busy}
                    onReply={onReply}
                    onResolve={onResolve}
                    onDelete={onDelete}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {threads.length === 0 && (
          <p className="text-[10px] italic text-slate-400">No comments yet.</p>
        )}
      </div>
    </div>
  )
}

// ─── CommentsTab ───────────────────────────────────────────────────────────────

export interface CommentsTabProps {
  programId: string
  /** PA title lookup: paId → title. Used for section headers + links. */
  paLookup: Map<string, string>
  currentUserId?: string
  loadComments: (programId: string) => Promise<{ comments: ProgramComment[] } | { error: string }>
  postComment?: (programId: string, payload: { content: string; parentCommentId?: string; targetType?: string; targetId?: string }) => Promise<{ comment: ProgramComment } | { error: string }>
  deleteComment?: (commentId: string) => Promise<{ success: string } | { error: string }>
  resolveComment?: (commentId: string, resolved: boolean, note?: string, reply?: string) => Promise<{ comment: ProgramComment } | { error: string }>
  /** Called when user clicks a PA section header link; receives paId. */
  onOpenPa?: (paId: string) => void
  /** Bump this key to force a refresh (e.g. after posting from another tab) */
  refreshKey?: number
  /** When set, only shows comments targeting this PA id (for the PA drawer scoped view) */
  filterTargetId?: string
}

export function CommentsTab({
  programId,
  paLookup,
  currentUserId,
  loadComments,
  postComment,
  deleteComment,
  resolveComment,
  onOpenPa,
  refreshKey,
  filterTargetId,
}: CommentsTabProps) {
  type State = { comments: ProgramComment[]; loading: boolean; error: string | null }
  type Action = { type: 'loaded'; comments: ProgramComment[] } | { type: 'failed'; error: string }
  const [{ comments, loading, error }, dispatch] = useReducer(
    (_: State, a: Action): State => {
      if (a.type === 'loaded') return { comments: a.comments, loading: false, error: null }
      return { comments: [], loading: false, error: a.error }
    },
    { comments: [], loading: true, error: null },
  )
  const [busy, startWork] = useTransition()

  const refresh = async () => {
    const r = await loadComments(programId)
    if ('comments' in r) dispatch({ type: 'loaded', comments: r.comments })
    else dispatch({ type: 'failed', error: r.error })
  }

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'loaded', comments: [] })
    void (async () => {
      const r = await loadComments(programId)
      if (cancelled) return
      if ('comments' in r) dispatch({ type: 'loaded', comments: r.comments })
      else dispatch({ type: 'failed', error: r.error })
    })()
    return () => { cancelled = true }
  }, [programId, loadComments, refreshKey])

  // Build threaded structure
  const roots = comments.filter((c) => !c.parentCommentId)
  const replyMap = new Map<string, ProgramComment[]>()
  for (const r of comments.filter((c) => c.parentCommentId)) {
    const arr = replyMap.get(r.parentCommentId!) ?? []
    arr.push(r)
    replyMap.set(r.parentCommentId!, arr)
  }
  const threads: ProgramComment[] = roots.map((r) => ({ ...r, replies: replyMap.get(r.id) ?? [] }))

  // Filter to a specific PA if requested (PA drawer scoped view)
  const visibleThreads = filterTargetId
    ? threads.filter((t) => t.targetId === filterTargetId)
    : threads

  // Group
  const publicFeedback = visibleThreads.filter((t) => t.stage === 'PUBLIC_FEEDBACK')
  const programLevel = visibleThreads.filter(
    (t) => t.stage !== 'PUBLIC_FEEDBACK' && t.targetType !== 'PROJECT_ACTIVITY',
  )
  const paThreadsAll = visibleThreads.filter(
    (t) => t.stage !== 'PUBLIC_FEEDBACK' && t.targetType === 'PROJECT_ACTIVITY' && t.targetId,
  )
  const paGrouped = new Map<string, ProgramComment[]>()
  for (const t of paThreadsAll) {
    const paId = t.targetId!
    const arr = paGrouped.get(paId) ?? []
    arr.push(t)
    paGrouped.set(paId, arr)
  }

  const handleReply = (parentId: string, content: string) => {
    if (!postComment) return
    const parent = threads.find((t) => t.id === parentId) ?? comments.find((c) => c.id === parentId)
    startWork(async () => {
      await postComment(programId, { content, parentCommentId: parentId })
      await refresh()
    })
  }

  const handleResolve = (commentId: string, resolved: boolean, note?: string, reply?: string) => {
    if (!resolveComment) return
    startWork(async () => {
      await resolveComment(commentId, resolved, note, reply)
      await refresh()
    })
  }

  const handleDelete = (commentId: string) => {
    if (!deleteComment) return
    startWork(async () => {
      await deleteComment(commentId)
      await refresh()
    })
  }

  const totalOpen = visibleThreads.filter((t) => !t.resolvedAt).length
  const isEmpty = !loading && visibleThreads.length === 0

  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5">
        <MessageSquare className="h-3.5 w-3.5 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Comments
        </span>
        {totalOpen > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
            {totalOpen} open
          </span>
        )}
      </div>

      <div className="space-y-2 px-3 py-2.5">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading comments…
          </div>
        )}
        {!!error && <p className="text-xs text-red-600">{error}</p>}
        {isEmpty && (
          <p className="py-4 text-center text-xs text-slate-400">No comments yet.</p>
        )}

        {/* Per-PA sections (only shown in program-level view) */}
        {!filterTargetId && paGrouped.size > 0 && Array.from(paGrouped.entries()).map(([paId, paThreads]) => (
          <ThreadGroup
            key={paId}
            label={paLookup.get(paId) ?? `Project/Activity ${paId.slice(0, 8)}`}
            color="green"
            threads={paThreads}
            currentUserId={currentUserId}
            busy={busy}
            onOpenTarget={onOpenPa ? () => onOpenPa(paId) : undefined}
            onReply={postComment ? handleReply : undefined}
            onResolve={resolveComment ? handleResolve : undefined}
            onDelete={deleteComment ? handleDelete : undefined}
          />
        ))}

        {/* Program-level threads */}
        {programLevel.length > 0 && (
          <ThreadGroup
            label="Program-level"
            color="blue"
            threads={programLevel}
            currentUserId={currentUserId}
            busy={busy}
            onReply={postComment ? handleReply : undefined}
            onResolve={resolveComment ? handleResolve : undefined}
            onDelete={deleteComment ? handleDelete : undefined}
          />
        )}

        {/* PA-scoped flat view (used in PA drawer) */}
        {filterTargetId && visibleThreads.length > 0 && (
          <ThreadGroup
            label={paLookup.get(filterTargetId) ?? "This Project/Activity"}
            color="green"
            threads={visibleThreads}
            currentUserId={currentUserId}
            busy={busy}
            onReply={postComment ? handleReply : undefined}
            onResolve={resolveComment ? handleResolve : undefined}
            onDelete={deleteComment ? handleDelete : undefined}
          />
        )}

        {/* Public feedback section */}
        {publicFeedback.length > 0 && (
          <ThreadGroup
            label="Public Feedback"
            color="slate"
            threads={publicFeedback.map((t) => {
              const { author, message } = parseFeedbackContent(t.content)
              return {
                ...t,
                // Show parsed author as a fake actor for display
                author: { id: 'public', name: author, role: '', office: null },
                content: message,
              }
            })}
            currentUserId={currentUserId}
            busy={busy}
            onResolve={resolveComment ? handleResolve : undefined}
          />
        )}
      </div>
    </section>
  )
}
