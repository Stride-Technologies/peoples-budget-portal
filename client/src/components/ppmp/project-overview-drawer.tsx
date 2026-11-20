'use client';

import { Sheet, SheetContent } from '@/components/ui/sheet';
import PpmpDetailView from './ppmp-detail-view';

interface ProjectOverviewDrawerProps {
  ppmpId: string | null;
  onClose: () => void;
  /** Scrolls straight to the "Add a line item" form on open — the table's Plus icon uses this. */
  focusAddLineItem?: boolean;
  /** Opens directly in edit mode for one line item — the table's Pencil icon uses this. */
  focusEditLineItemId?: string | null;
  /** Fires after a successful delete — the registry table's only delete path (no per-row icon anymore). */
  onDeleted?: () => void;
}

/**
 * Slide-over view of a Project — lets staff view details, comment, review
 * public feedback, check history, and add a line item without leaving the
 * registry list (spec.md FR-007). Reuses `PpmpDetailView`'s `variant="drawer"`
 * rendering, styled after `program-overview-drawer.tsx`'s sticky header —
 * this drawer, not the full `/ppmp-registry/[id]` page, is the only place
 * Comments/Public Feedback/History are reachable.
 *
 * No `overflow-y-auto` here — `PpmpDetailView`'s drawer variant owns its own
 * scroll region internally (sticky header, then a scrollable tab body), the
 * same split `program-overview-drawer.tsx` uses.
 */
export function ProjectOverviewDrawer({
  ppmpId,
  onClose,
  focusAddLineItem,
  focusEditLineItemId,
  onDeleted,
}: Readonly<ProjectOverviewDrawerProps>) {
  return (
    <Sheet open={ppmpId != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="flex w-full flex-col p-0 data-[side=right]:sm:max-w-2xl"
      >
        {ppmpId && (
          <PpmpDetailView
            id={ppmpId}
            onBack={onClose}
            focusAddLineItem={focusAddLineItem}
            focusEditLineItemId={focusEditLineItemId}
            onDeleted={onDeleted}
            variant="drawer"
          />
        )}
      </SheetContent>
    </Sheet>
  );
}
