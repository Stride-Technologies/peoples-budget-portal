'use client';

import { useRef } from 'react';
import { toast } from 'sonner';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import AddProjectForm from '@/components/project-activity/add-project-form';

interface NewProjectActivityDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful save, with the new Project/Activity's id. */
  onCreated: (id: string) => void;
  kind: 'project' | 'activity';
  /** Required for a Project (its owning Program); unused for an Activity,
   * which resolves its program through `parentProjectId` instead. */
  parentProgramId?: string;
  /** Required for an Activity (the Project it nests under). */
  parentProjectId?: string;
  /** The success toast's "Add Another" action — reopens a fresh drawer for
   * the same program/project, mirroring the Program drawer's "Add Project"
   * toast action. */
  onAddAnother: () => void;
}

/**
 * "New Project" / "New Activity" as an in-place drawer, replacing
 * `/programs/[id]/add-project` and `/projects/[id]/add-activity` (FR-012).
 * The shell is deliberately thin: `AddProjectForm` always renders its own
 * header (eyebrow, title, close button, progress bar, section tabs), so this
 * component only sizes and mounts the `Sheet` — a second header here would
 * double up with that one, and the
 * Sheet must not scroll itself: `AddProjectForm`'s own flex-column layout
 * (header/footer `flex:none`, body `flex:1 overflow-y-auto`) is what keeps
 * the Status/Save/Cancel bar pinned to the bottom instead of rendering
 * mid-page over the content.
 */
export default function NewProjectActivityDrawer({
  open,
  onClose,
  onCreated,
  kind,
  parentProgramId,
  parentProjectId,
  onAddAnother,
}: Readonly<NewProjectActivityDrawerProps>) {
  // Escape and outside-press go through the form's unsaved-changes guard too.
  const closeRequestRef = useRef<(() => void) | null>(null);
  const entryLabel = kind === 'project' ? 'Project' : 'Activity';
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) (closeRequestRef.current ?? onClose)(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex flex-col overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-[1080px]"
      >
        <AddProjectForm
          closeRequestRef={closeRequestRef}
          programId={kind === 'project' ? parentProgramId : undefined}
          projectId={kind === 'activity' ? parentProjectId : undefined}
          defaultEntryType={kind}
          onNavigateAway={onClose}
          onSaved={onCreated}
          onCreateSuccess={(result) => {
            onClose();
            toast.success(`${entryLabel} created successfully`, {
              description: result.programName
                ? `"${result.entryName}" has been added to ${result.programName}.`
                : `"${result.entryName}" has been added.`,
              action: {
                label: 'Add Another',
                onClick: onAddAnother,
              },
            });
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
