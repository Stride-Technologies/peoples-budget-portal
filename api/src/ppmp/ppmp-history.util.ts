export interface PpmpHistoryEntry {
  id: string;
  kind: string;
  at: string;
  summary: string;
}

export interface PpmpHistoryInput {
  id: string;
  name: string;
  createdAt: Date;
  approvedAt: Date | null;
  status: string;
  publishedAt: Date | null;
  isPublished: boolean;
  updatedAt: Date;
  lineItems: {
    id: string;
    lineItemName: string;
    createdAt: Date;
    updatedAt: Date;
  }[];
}

/**
 * Synthesizes a "what happened when" timeline from timestamps that already
 * exist on PPMP/PPMPLineItem — no per-field diffing, no audit-log table
 * (specs/005 research.md Decision 5). Shared by the authenticated history
 * endpoint (`PpmpService.getHistory`) and the public one (`PublicService.
 * getPpmpHistory`) so the synthesis logic — not just its RBAC/visibility
 * wrapper — has exactly one implementation.
 */
export function buildPpmpHistory(ppmp: PpmpHistoryInput): PpmpHistoryEntry[] {
  const entries: PpmpHistoryEntry[] = [
    {
      id: `${ppmp.id}-created`,
      kind: 'created',
      at: ppmp.createdAt.toISOString(),
      summary: `Project created: ${ppmp.name}`,
    },
  ];

  if (ppmp.approvedAt) {
    entries.push({
      id: `${ppmp.id}-approved`,
      kind: 'approved',
      at: ppmp.approvedAt.toISOString(),
      summary: 'Project approved',
    });
    if (ppmp.status === 'DRAFT' && ppmp.updatedAt > ppmp.approvedAt) {
      entries.push({
        id: `${ppmp.id}-reverted-to-draft`,
        kind: 'reverted_to_draft',
        at: ppmp.updatedAt.toISOString(),
        summary:
          'Project reverted to draft after an edit — needs re-approval before it can be published',
      });
    }
    if (ppmp.status === 'REVISION' && ppmp.updatedAt > ppmp.approvedAt) {
      entries.push({
        id: `${ppmp.id}-reverted-to-revision`,
        kind: 'reverted_to_revision',
        at: ppmp.updatedAt.toISOString(),
        summary:
          'Project unpublished and marked for revision after an edit — needs re-approval before it can be republished',
      });
    }
  }

  if (ppmp.publishedAt) {
    entries.push({
      id: `${ppmp.id}-published`,
      kind: 'published',
      at: ppmp.publishedAt.toISOString(),
      summary: 'Project published',
    });
    // Skip the generic "unpublished" entry when REVISION already explains
    // it above — both fire from the same edit, at the same timestamp, and
    // the REVISION one is the more specific of the two.
    if (!ppmp.isPublished && ppmp.status !== 'REVISION') {
      entries.push({
        id: `${ppmp.id}-unpublished`,
        kind: 'unpublished',
        at: ppmp.updatedAt.toISOString(),
        summary: 'Project unpublished',
      });
    }
  }

  for (const li of ppmp.lineItems) {
    const isNew =
      Math.abs(li.updatedAt.getTime() - li.createdAt.getTime()) < 1000;
    entries.push({
      id: `${li.id}-${isNew ? 'added' : 'updated'}`,
      kind: isNew ? 'line_item_added' : 'line_item_updated',
      at: (isNew ? li.createdAt : li.updatedAt).toISOString(),
      summary: `${isNew ? 'Line item added' : 'Line item updated'}: ${li.lineItemName}`,
    });
  }

  return entries.sort((a, b) => (a.at < b.at ? 1 : -1));
}
