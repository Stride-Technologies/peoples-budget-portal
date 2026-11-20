'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Check, X, ArrowLeft, Upload, RefreshCw, EyeOff, ShieldCheck, Trash2, CopyPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { cn } from '@/lib/utils';
import PpmpLineItemsSection from './ppmp-line-items-section';
import ProjectCommentsTab from './project-comments-tab';
import ProjectFeedbackTab from './project-feedback-tab';
import ProjectHistoryTab from './project-history-tab';
import { DrawerTabs, DrawerTabPanel } from '@/components/aip/drawer-tabs';
import type { PpmpRecord, UacsObjectRecord } from '@/lib/api';
import {
  loadPpmpDetail,
  renamePpmp,
  deletePpmp,
  approvePpmp,
  publishPpmp,
  unpublishPpmp,
  createFinalPpmp,
} from '@/app/ppmp-registry/[id]/_actions';

type ProjectTab = 'details' | 'comments' | 'feedback' | 'history';

interface PpmpDetailViewProps {
  id: string;
  /** Overrides the back button — used when embedded in a drawer instead of a full page. */
  onBack?: () => void;
  /** Scrolls straight to the "Add a line item" form once loaded — the registry table's Plus icon uses this. */
  focusAddLineItem?: boolean;
  /** Opens directly in edit mode for one line item — the registry table's Pencil icon uses this. */
  focusEditLineItemId?: string | null;
  /**
   * 'page' (default): the plain full-page line-item editor at
   * `/ppmp-registry/[id]` — no tabs, Comments/Public Feedback/History are
   * not reachable here.
   * 'drawer': the AIP `program-overview-drawer.tsx`-styled "Project
   * Overview" — sticky blue header + the full Details/Comments/Public
   * Feedback/History tab set. Only reachable via the Eye/Plus icons on the
   * PPMP Registry table (client/src/components/ppmp/ppmp-master-list.tsx).
   */
  variant?: 'page' | 'drawer';
  /** Fires after a successful delete — the registry table's only delete path (no per-row icon anymore). */
  onDeleted?: () => void;
}

export default function PpmpDetailView({
  id,
  onBack,
  focusAddLineItem,
  focusEditLineItemId,
  onDeleted,
  variant = 'page',
}: Readonly<PpmpDetailViewProps>) {
  const router = useRouter();
  const [ppmp, setPpmp] = useState<PpmpRecord | null>(null);
  const [uacsObjects, setUacsObjects] = useState<UacsObjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingFinal, setCreatingFinal] = useState(false);
  const [tab, setTab] = useState<ProjectTab>('details');
  const [editingLineItemName, setEditingLineItemName] = useState<string | null>(null);

  useEffect(() => {
    loadPpmpDetail(id).then((result) => {
      if ('error' in result) {
        setError(result.error);
      } else {
        setPpmp(result.data.ppmp);
        setUacsObjects(result.data.uacsObjects);
        setNameDraft(result.data.ppmp.name);
      }
      setLoading(false);
    });
  }, [id]);

  const saveName = async () => {
    if (!ppmp || !nameDraft.trim()) return;
    setSavingName(true);
    const result = await renamePpmp(ppmp.id, nameDraft.trim());
    setSavingName(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPpmp(result.ppmp);
    setEditingName(false);
  };

  const handleTogglePublish = async () => {
    if (!ppmp) return;
    setPublishing(true);
    const result = ppmp.isPublished
      ? await unpublishPpmp(ppmp.id)
      : await publishPpmp(ppmp.id);
    setPublishing(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPpmp(result.ppmp);
  };

  const handleApprove = async () => {
    if (!ppmp) return;
    setApproving(true);
    const result = await approvePpmp(ppmp.id);
    setApproving(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    setPpmp(result.ppmp);
  };

  /** specs/012 D9: copy this Indicative PPMP as the Final one, relinked to the enacted budget. */
  const handleCreateFinal = async () => {
    if (!ppmp) return;
    setCreatingFinal(true);
    const result = await createFinalPpmp(ppmp.id);
    setCreatingFinal(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    toast.success(
      result.unmatched > 0
        ? `Final PPMP created. ${result.unmatched} line${result.unmatched === 1 ? '' : 's'} need linking to the enacted budget.`
        : 'Final PPMP created.',
    );
    router.push(`/ppmp-registry/${result.ppmpId}`);
  };

  const handleDelete = async () => {
    if (!ppmp) return;
    setDeleting(true);
    const result = await deletePpmp(ppmp.id);
    setDeleting(false);
    if ('error' in result) {
      setError(result.error);
      return;
    }
    onDeleted?.();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error && !ppmp) {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!ppmp) return null;

  const isDrawer = variant === 'drawer';

  const nameEditor = editingName ? (
    <div className="flex flex-1 items-center gap-2">
      <Input
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        className={cn(
          'h-9 max-w-md font-semibold',
          isDrawer
            ? 'border-white/30 bg-white/10 text-[15px] text-white placeholder:text-blue-100'
            : 'h-10 text-lg',
        )}
      />
      <button
        type="button"
        onClick={saveName}
        disabled={savingName}
        className={cn('rounded p-1', isDrawer ? 'hover:bg-blue-700/40' : 'hover:bg-slate-100')}
        aria-label="Save name"
      >
        <Check className={cn('h-4 w-4', isDrawer && 'text-blue-100')} />
      </button>
      <button
        type="button"
        onClick={() => {
          setEditingName(false);
          setNameDraft(ppmp.name);
        }}
        className={cn('rounded p-1', isDrawer ? 'hover:bg-blue-700/40' : 'hover:bg-slate-100')}
        aria-label="Cancel rename"
      >
        <X className={cn('h-4 w-4', isDrawer && 'text-blue-100')} />
      </button>
    </div>
  ) : null;

  const notApproved = ppmp.status !== 'APPROVED';
  /** Has this Project gone live at least once — "Republish" vs. "Publish". */
  const isRepublish = ppmp.publishedAt !== null;
  const publishDisabledReason = ppmp.isPublished
    ? undefined
    : ppmp.lineItems.length === 0
      ? 'Add at least one line item before publishing'
      : notApproved
        ? `This Project must be approved before it can be ${isRepublish ? 're' : ''}published`
        : undefined;

  // The drawer header switches blue "Project Overview" -> orange "Line Item
  // Overview" while a specific line item is being edited (Details tab,
  // ppmp-line-items-section.tsx's onEditingLineItemChange) — same color
  // split as the orange Eye/Pencil line-item icons vs. blue Project ones
  // elsewhere in this module. These action buttons live on that band, so
  // their hover tint follows it too.
  const isEditingLineItem = !!editingLineItemName;
  const headerHoverClass = isEditingLineItem ? 'hover:bg-orange-700/40' : 'hover:bg-blue-700/40';

  const publishAction = (
    <Button
      variant="outline"
      size={isDrawer ? 'sm' : 'default'}
      onClick={handleTogglePublish}
      disabled={
        publishing ||
        (!ppmp.isPublished && (ppmp.lineItems.length === 0 || notApproved))
      }
      title={publishDisabledReason}
      className={cn(isDrawer && cn('border-white/30 bg-transparent text-white hover:text-white', headerHoverClass))}
    >
      {publishing ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : ppmp.isPublished ? (
        <EyeOff className="mr-1.5 h-3.5 w-3.5" />
      ) : isRepublish ? (
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <Upload className="mr-1.5 h-3.5 w-3.5" />
      )}
      {ppmp.isPublished ? 'Unpublish' : isRepublish ? 'Republish' : 'Publish'}
    </Button>
  );

  const approveAction = notApproved ? (
    <Button
      variant="outline"
      size={isDrawer ? 'sm' : 'default'}
      onClick={handleApprove}
      disabled={approving}
      className={cn(isDrawer && cn('border-white/30 bg-transparent text-white hover:text-white', headerHoverClass))}
    >
      {approving ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
      )}
      Approve
    </Button>
  ) : null;

  const createFinalAction =
    ppmp.kind === 'INDICATIVE' ? (
      <AlertDialog>
        <AlertDialogTrigger
          disabled={creatingFinal}
          className={buttonVariants({
            variant: 'outline',
            size: isDrawer ? 'sm' : 'default',
            className: isDrawer
              ? cn('border-white/30 bg-transparent text-white hover:text-white', headerHoverClass)
              : undefined,
          })}
        >
          {creatingFinal ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <CopyPlus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Create Final PPMP
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Create the Final PPMP?</AlertDialogTitle>
            <AlertDialogDescription>
              This copies every line into a new draft Final PPMP and links each one to the
              enacted budget&apos;s program, project or activity where it can. This one stays
              as it is. It can only be done once the year&apos;s budget is enacted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCreateFinal}>Create</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ) : null;

  const kindLabel = ppmp.kind === 'FINAL' ? 'Final' : 'Indicative';

  const deleteAction = (
    <AlertDialog>
      <AlertDialogTrigger
        className={buttonVariants({
          variant: 'outline',
          size: isDrawer ? 'sm' : 'default',
          className: isDrawer
            ? cn('border-white/30 bg-transparent text-white hover:text-white', headerHoverClass)
            : 'text-red-600 hover:text-red-700',
        })}
      >
        {deleting ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        )}
        Delete
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{ppmp.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the Project and all {ppmp.lineItems.length} of its line
            items. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  const detailsContent = (
    <PpmpLineItemsSection
      ppmp={ppmp}
      uacsObjects={uacsObjects}
      onChange={setPpmp}
      scrollToAddOnMount={focusAddLineItem}
      focusEditLineItemId={focusEditLineItemId}
      onEditingLineItemChange={setEditingLineItemName}
    />
  );

  if (isDrawer) {
    // Modeled on client/src/components/aip/program-overview-drawer.tsx's
    // ProgramOverviewHeader (sticky blue band, eyebrow label, status chip,
    // mono code line) — same chrome, Project-specific content. This is the
    // ONLY place Comments/Public Feedback/History are reachable; the plain
    // page below has none of them (specs/005-ppmp-to-project decision).
    return (
      <div className="flex h-full min-h-0 flex-col bg-slate-50">
        <div
          className={cn(
            'sticky top-0 z-20 px-6 py-3 text-white shadow-sm transition-colors',
            isEditingLineItem ? 'bg-orange-600' : 'bg-blue-600',
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                <span
                  className={cn(
                    'text-[9px] font-normal tracking-[0.11em]',
                    isEditingLineItem ? 'text-orange-100' : 'text-blue-100',
                  )}
                >
                  {isEditingLineItem ? 'LINE ITEM OVERVIEW' : 'PROJECT OVERVIEW'}
                </span>
                <Badge
                  variant="outline"
                  className="rounded border border-white/30 bg-white/10 px-1.5 py-0 text-[8px] font-normal text-white"
                >
                  {ppmp.isPublished ? 'Published' : 'Unpublished'}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded border border-white/30 bg-white/10 px-1.5 py-0 text-[8px] font-normal text-white"
                >
                  {ppmp.status === 'APPROVED'
                    ? 'Approved'
                    : ppmp.status === 'REVISION'
                      ? 'Revision'
                      : 'Draft'}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded border border-white/30 bg-white/10 px-1.5 py-0 text-[8px] font-normal text-white"
                >
                  {ppmp.lineItems.length} line item{ppmp.lineItems.length === 1 ? '' : 's'}
                </Badge>
                <Badge
                  variant="outline"
                  className="rounded border border-white/30 bg-white/10 px-1.5 py-0 text-[8px] font-normal text-white"
                >
                  {kindLabel}
                </Badge>
              </div>
              {nameEditor ?? (
                <div className="flex items-center gap-1.5">
                  <h2
                    className="line-clamp-2 text-[15px] font-semibold leading-[1.18] text-white"
                    title={isEditingLineItem ? editingLineItemName! : ppmp.name}
                  >
                    {isEditingLineItem ? editingLineItemName : ppmp.name}
                  </h2>
                  {!isEditingLineItem && (
                    <button
                      type="button"
                      onClick={() => setEditingName(true)}
                      className={cn('shrink-0 rounded p-0.5', headerHoverClass)}
                      aria-label="Rename Project"
                    >
                      <Pencil className="h-3 w-3 text-blue-100" />
                    </button>
                  )}
                </div>
              )}
              <p
                className={cn(
                  'truncate text-[9px]',
                  isEditingLineItem ? 'text-orange-100/80' : 'text-blue-100/80',
                )}
                title={isEditingLineItem ? ppmp.name : ppmp.fundingProgram}
              >
                {isEditingLineItem ? `In Project: ${ppmp.name}` : `Funding AIP Program: ${ppmp.fundingProgram}`}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {approveAction}
              {createFinalAction}
              {publishAction}
              {deleteAction}
              <button
                type="button"
                onClick={onBack}
                className={cn('rounded p-1 transition-colors', headerHoverClass)}
                aria-label="Close drawer"
              >
                <X className={cn('h-4 w-4', isEditingLineItem ? 'text-orange-100' : 'text-blue-100')} />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="px-6 pt-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <DrawerTabs<ProjectTab>
          idPrefix="project-overview"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'details', label: 'Details' },
            { value: 'comments', label: 'Comments' },
            { value: 'feedback', label: 'Public Feedback' },
            { value: 'history', label: 'History' },
          ]}
          className="bg-white"
        />
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <DrawerTabPanel idPrefix="project-overview" value="details" active={tab === 'details'}>
            {detailsContent}
          </DrawerTabPanel>
          <DrawerTabPanel idPrefix="project-overview" value="comments" active={tab === 'comments'}>
            <ProjectCommentsTab ppmpId={ppmp.id} />
          </DrawerTabPanel>
          <DrawerTabPanel idPrefix="project-overview" value="feedback" active={tab === 'feedback'}>
            <ProjectFeedbackTab ppmpId={ppmp.id} />
          </DrawerTabPanel>
          <DrawerTabPanel idPrefix="project-overview" value="history" active={tab === 'history'}>
            <ProjectHistoryTab ppmpId={ppmp.id} />
          </DrawerTabPanel>
        </div>
      </div>
    );
  }

  // Plain full-page editor — no tabs, Comments/Public Feedback/History are
  // not reachable here. Reach them via the PPMP Registry table's Eye/Plus
  // icons, which open the 'drawer' variant above instead.
  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:space-y-6 md:p-8">
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack ?? (() => router.push('/ppmp-registry'))}
        className="-ml-2"
      >
        <ArrowLeft className="mr-1 h-4 w-4" /> {onBack ? 'Close' : 'Back to Projects'}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start justify-between gap-3">
        {nameEditor ?? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className="line-clamp-2 min-w-0 font-heading text-xl font-semibold text-slate-950 md:text-2xl"
                title={ppmp.name}
              >
                {ppmp.name}
              </h1>
              <Button size="icon" variant="ghost" onClick={() => setEditingName(true)} className="shrink-0">
                <Pencil className="h-4 w-4" />
              </Button>
              {ppmp.isPublished ? (
                <Badge className="border-green-200 bg-green-50 text-green-700">Published</Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">Unpublished</Badge>
              )}
              {ppmp.status === 'APPROVED' ? (
                <Badge className="border-blue-200 bg-blue-50 text-blue-700">Approved</Badge>
              ) : ppmp.status === 'REVISION' ? (
                <Badge className="border-violet-200 bg-violet-50 text-violet-700">Revision</Badge>
              ) : (
                <Badge variant="outline" className="border-amber-200 text-amber-700">Draft</Badge>
              )}
              <Badge variant="outline" className="font-normal text-slate-600">
                {ppmp.lineItems.length} line item{ppmp.lineItems.length === 1 ? '' : 's'}
              </Badge>
              <Badge
                variant="outline"
                className={cn('font-normal', ppmp.kind === 'FINAL' ? 'border-teal-200 text-teal-700' : 'text-slate-600')}
              >
                {kindLabel}
              </Badge>
            </div>
            <p className="mt-0.5 truncate text-xs text-slate-500" title={ppmp.fundingProgram}>
              Funding AIP Program: {ppmp.fundingProgram}
            </p>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {approveAction}
          {createFinalAction}
          {publishAction}
          {deleteAction}
        </div>
      </div>

      {detailsContent}
    </div>
  );
}
