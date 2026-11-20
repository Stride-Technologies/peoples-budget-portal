'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Archive,
  ArchiveRestore,
  ClipboardCheck,
  FileEdit,
  Globe,
  Loader2,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import type { PublishReadiness } from '@/lib/api';
import {
  acknowledgeProgramImport,
  archiveProgram,
  discardProgramDraft,
  loadPublishReadiness,
  publishProgram,
  reviseProgram,
  unarchiveProgram,
} from '@/app/aip-registry/_actions';

const BLOCKER_TEXT: Record<string, string> = {
  NO_PPAS: 'No projects or activities added yet',
  ZERO_PROPOSED_BUDGET: 'One or more PPAs have no proposed budget',
  ALREADY_PUBLISHED: 'Already published with no pending changes',
  NOT_PUBLISHABLE_STATUS: 'Not in a publishable state',
  INCOMPLETE_IMPORT:
    "The AIP workbook import made decisions here that nobody has confirmed yet",
  // Fund source and expected output no longer block (specs/013); they stay as
  // warnings below and read "Not yet stated" on the public page.
  INCOMPLETE_DATA:
    'Implementation dates are missing, or a climate amount has no CCET code',
  EMPTY_PARENT_PPA:
    'A project set to take its cost from child activities has none',
};

interface PublishPanelProps {
  programId: string;
  /** Raw ProgramStatus — this component keys entirely off it. */
  status: string;
  /** Version the public is currently served, if any. */
  publishedVersion?: number | null;
  /** Holds `aip:publish`. Without it the button is disabled with a reason, not hidden. */
  canPublish: boolean;
  /** Holds `aip:write`. Gates revise and discard. */
  canWrite: boolean;
  /** Archive / unarchive are SUPER_ADMIN only (specs/013). */
  isSuperAdmin?: boolean;
  /** Why it was archived, shown while ARCHIVED. */
  archivedReason?: string | null;
  onChanged?: () => void;
  onCompare?: () => void;
}

/**
 * The publish affordances for screens 2 and 3.
 *
 * Everything keys off status, which is the codebase's single source of truth for
 * editability:
 *
 *   PUBLISHED           → locked as a budget document; "Edit this AIP" opens a revision
 *   PUBLISHED_REVISION  → amber banner + Discard / Publish
 *   DRAFT               → first publish
 *   ARCHIVED            → read-only notice; a super admin can unarchive to DRAFT
 *
 * A user without `aip:publish` sees Publish **disabled with a reason** rather
 * than hidden — hiding it makes the workflow look broken instead of delegated.
 */
export default function PublishPanel({
  programId,
  status,
  publishedVersion,
  canPublish,
  canWrite,
  isSuperAdmin = false,
  archivedReason,
  onChanged,
  onCompare,
}: Readonly<PublishPanelProps>) {
  const [readiness, setReadiness] = useState<PublishReadiness | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    'revise' | 'discard' | 'publish' | 'review' | 'archive' | 'unarchive' | null
  >(null);
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();
  /**
   * Bumped after any successful action so readiness is re-fetched. Status alone
   * is not enough: confirming the import clears a blocker without moving the
   * program's status, so keying the effect on status only would leave the panel
   * still showing what the user just resolved.
   */
  const [refreshKey, setRefreshKey] = useState(0);

  const isPublished = status === 'PUBLISHED';
  const isRevision = status === 'PUBLISHED_REVISION';
  const isDraft = status === 'DRAFT';
  const isArchived = status === 'ARCHIVED';
  // APPROVED is publishable server-side — it is the end of the workflow, and
  // the enacted 2026 book arrives APPROVED and unpublished.
  const isApproved = status === 'APPROVED';
  const showsPublish = isDraft || isRevision || isApproved;

  // Readiness drives the publish button's enabled state, so it is only fetched
  // where a publish is actually possible.
  useEffect(() => {
    if (!showsPublish) return;
    let cancelled = false;
    loadPublishReadiness(programId).then((res) => {
      if (cancelled) return;
      if ('readiness' in res) setReadiness(res.readiness);
    });
    return () => {
      cancelled = true;
    };
  }, [programId, showsPublish, status, refreshKey]);

  function run(action: () => Promise<{ success: string } | { error: string }>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const res = await action();
      if ('error' in res) setError(res.error);
      else {
        setMessage(res.success);
        setRefreshKey((n) => n + 1);
        onChanged?.();
      }
      setConfirm(null);
      setReason('');
    });
  }

  return (
    <div className="space-y-3">
      {/* ── Published: locked as a budget document, open as a conversation ── */}
      {isPublished && (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <Globe className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <div className="flex-1 text-sm text-emerald-900">
            <p className="font-medium">Live on the public registry</p>
            <p className="text-emerald-800/90">
              {publishedVersion
                ? `The public is seeing version v${publishedVersion}. `
                : 'The public is seeing the published version. '}
              Figures are locked. To change them, open a revision — the public
              keeps seeing the published version until you republish.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {canWrite && (
              <Button
                size="sm"
                onClick={() => setConfirm('revise')}
                disabled={isPending}
              >
                <Pencil className="size-3.5" />
                Edit this AIP
              </Button>
            )}
            {isSuperAdmin && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirm('archive')}
                disabled={isPending}
              >
                <Archive className="size-3.5" />
                Archive
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Archived: superseded, read-only, in no total (specs/013) ───── */}
      {isArchived && (
        <div className="flex items-start gap-3 rounded-lg border border-zinc-300 bg-zinc-50 p-3">
          <Archive className="mt-0.5 size-4 shrink-0 text-zinc-600" />
          <div className="flex-1 text-sm text-zinc-800">
            <p className="font-medium">Archived</p>
            <p className="text-zinc-700">
              {archivedReason ? `${archivedReason}. ` : ''}
              It is kept for its history and comments but counts in no total
              or export. Its public link still opens, marked archived.
            </p>
          </div>
          {isSuperAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirm('unarchive')}
              disabled={isPending}
            >
              <ArchiveRestore className="size-3.5" />
              Unarchive
            </Button>
          )}
        </div>
      )}

      {/* ── Revision open: make the divergence loud ─────────────────────── */}
      {isRevision && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-start gap-3">
            <FileEdit className="mt-0.5 size-4 shrink-0 text-amber-700" />
            <div className="flex-1 text-sm text-amber-900">
              <p className="font-medium">Draft changes not yet published</p>
              <p className="text-amber-800/90">
                {publishedVersion
                  ? `The public still sees v${publishedVersion} until someone with publish rights republishes.`
                  : 'The public still sees the last published version until someone republishes.'}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {onCompare && (
                  <Button size="sm" variant="outline" onClick={onCompare}>
                    Compare with published
                  </Button>
                )}
                {!canPublish && (
                  <span className="text-xs text-amber-800/80">
                    You can&rsquo;t publish — ask a CPDO Head.
                  </span>
                )}
                {readiness && readiness.unresolvedComments > 0 && (
                  <span className="text-xs text-amber-800/80">
                    {readiness.unresolvedComments} comment thread
                    {readiness.unresolvedComments === 1 ? '' : 's'} still
                    unresolved (won&rsquo;t block publishing).
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Blockers and advisories ─────────────────────────────────────── */}
      {showsPublish && readiness && !readiness.ready && (
        <ul className="space-y-1 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {readiness.blockers.map((b) => (
            <li key={b}>• {BLOCKER_TEXT[b] ?? b}</li>
          ))}
        </ul>
      )}

      {/*
        Decisions the import made on this program's behalf. These cannot be
        re-checked against the data — an inferred finish line looks exactly like
        a chosen one — so a person has to confirm them. Missing *fields* are not
        listed here; those come through `warnings` below and clear themselves
        when the data is filled in.
      */}
      {showsPublish && readiness && readiness.importWarnings.length > 0 && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
          <p className="mb-1 font-medium">
            The AIP workbook import had to make these calls — check they&rsquo;re
            right:
          </p>
          <ul className="ml-4 list-disc space-y-0.5">
            {readiness.importWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setConfirm('review')}
              disabled={isPending || !canPublish}
              title={canPublish ? undefined : 'Requires aip:publish'}
            >
              <ClipboardCheck className="size-3.5" />
              Mark import reviewed
            </Button>
            {!canPublish && (
              <span className="text-xs text-orange-800/80">
                You can&rsquo;t confirm these — ask a CPDO Head.
              </span>
            )}
          </div>
        </div>
      )}
      {showsPublish &&
        readiness?.warnings.map((w) => (
          <p
            key={w}
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            ⚠ {w}
          </p>
        ))}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
      {showsPublish && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {isRevision && canWrite && (
            <Button
              size="sm"
              variant="outline"
              className="text-rose-700"
              onClick={() => setConfirm('discard')}
              disabled={isPending}
            >
              <Trash2 className="size-3.5" />
              Discard draft
            </Button>
          )}
          <span title={canPublish ? undefined : 'Requires aip:publish'}>
            <Button
              size="sm"
              onClick={() => setConfirm('publish')}
              disabled={
                isPending || !canPublish || (readiness ? !readiness.ready : true)
              }
            >
              {isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Upload className="size-3.5" />
              )}
              {isRevision ? 'Publish changes' : 'Publish'}
            </Button>
          </span>
        </div>
      )}

      {error && <p className="text-destructive text-sm">{error}</p>}
      {message && !error && (
        <p className={cn('text-sm', 'text-emerald-700')}>{message}</p>
      )}

      {/* ── Confirmations ───────────────────────────────────────────────── */}
      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === 'revise' && 'Open a revision?'}
              {confirm === 'discard' && 'Discard unpublished changes?'}
              {confirm === 'publish' &&
                (isRevision ? 'Publish these changes?' : 'Publish this AIP?')}
              {confirm === 'review' && 'Confirm the import made these calls correctly?'}
              {confirm === 'archive' && 'Archive this program?'}
              {confirm === 'unarchive' && 'Unarchive this program?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === 'revise' &&
                'This AIP will become editable. The public keeps seeing the currently published version until someone republishes.'}
              {confirm === 'discard' &&
                'Every unpublished change is reverted to the published version. This is recorded in the edit history and cannot be undone.'}
              {confirm === 'publish' && !isRevision && (
                <>
                  This makes the AIP public immediately.
                  {readiness && (
                    <Badge variant="secondary" className="ml-2 font-normal">
                      {readiness.paCount} PPA
                      {readiness.paCount === 1 ? '' : 's'} · ₱
                      {readiness.proposedTotal}
                    </Badge>
                  )}
                </>
              )}
              {confirm === 'publish' &&
                isRevision &&
                'The public registry updates immediately to show these figures.'}
              {confirm === 'review' &&
                'The notes above are removed and this program stops being held back by them. It is recorded in the edit history, along with what was cleared, but there is no undo button — anything still wrong has to be fixed by editing the program.'}
              {confirm === 'archive' &&
                'It leaves the public list, every total and every export right away, and becomes read-only. Its history and comments are kept, and its public link shows it as archived with the reason below.'}
              {confirm === 'unarchive' &&
                'It goes back to Drafts. It counts nowhere until it is published again.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(confirm === 'archive' || confirm === 'unarchive') && (
            <div className="space-y-1">
              <label htmlFor="archive-reason" className="text-sm font-medium">
                Reason{confirm === 'archive' ? ' (shown to the public)' : ''}
              </label>
              <Textarea
                id="archive-reason"
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder={
                  confirm === 'archive'
                    ? 'Superseded by the pre-final 2027 AIP import'
                    : 'Why it is needed again'
                }
              />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                isPending ||
                ((confirm === 'archive' || confirm === 'unarchive') &&
                  !reason.trim())
              }
              onClick={(e) => {
                e.preventDefault();
                if (confirm === 'revise') run(() => reviseProgram(programId));
                if (confirm === 'discard')
                  run(() => discardProgramDraft(programId));
                if (confirm === 'publish') run(() => publishProgram(programId));
                if (confirm === 'review')
                  run(() => acknowledgeProgramImport(programId));
                if (confirm === 'archive')
                  run(() => archiveProgram(programId, reason));
                if (confirm === 'unarchive')
                  run(() => unarchiveProgram(programId, reason));
              }}
            >
              {isPending ? 'Working…' : 'Confirm'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
