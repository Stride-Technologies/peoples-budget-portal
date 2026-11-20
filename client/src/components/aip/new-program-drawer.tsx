'use client';

import { useRef } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import NewProgramForm from '@/components/program/new-program-form';

interface NewProgramDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful save, with the new Program's id. */
  onCreated: (programId: string) => void;
  /** The save toast's "Add Project" action — opens the New Project drawer for the new program. */
  onAddProject: (programId: string) => void;
}

/**
 * "New Program" as an in-place drawer, replacing `/programs/new` (FR-012).
 * The shell is deliberately thin: `NewProgramForm` renders its own header
 * (eyebrow, title, close button, progress bar, section tabs) when `embedded`
 * is set, so this component only sizes and mounts the `Sheet` — a second
 * header here would double up with that one. `NewProgramForm` already owns
 * reference-data loading, the AIP-code preview debounce, autosave-to-draft,
 * and the unsaved-changes guard, none of which this feature touches
 * (research.md Decision 3). Its own `onNavigateToRegistry`/
 * `onNavigateToProject` callbacks
 * are repointed at the drawer instead of a `router.push`.
 */
export default function NewProgramDrawer({
  open,
  onClose,
  onCreated,
  onAddProject,
}: Readonly<NewProgramDrawerProps>) {
  // Escape and outside-press go through the form's unsaved-changes guard too.
  const closeRequestRef = useRef<(() => void) | null>(null);
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) (closeRequestRef.current ?? onClose)(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex flex-col overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:w-3/4 data-[side=right]:sm:max-w-[760px]"
      >
        <NewProgramForm
          closeRequestRef={closeRequestRef}
          onNavigateToRegistry={onClose}
          onNavigateToProject={onAddProject}
          onSaved={onCreated}
          embedded
        />
      </SheetContent>
    </Sheet>
  );
}
