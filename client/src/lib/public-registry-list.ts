import type { PublicProgramItem, PublicRegistryProjectActivity } from './api.ts';

/** The PA fields the public browse table reads — nothing else crosses to the client. */
export type PublicListActivity = Pick<
  PublicRegistryProjectActivity,
  | 'id'
  | 'type'
  | 'name'
  | 'parentProjectActivityId'
  | 'orderIndex'
  | 'tentativeAipReferenceCode'
  | 'aipReferenceCode'
  | 'costMode'
  | 'psTotal'
  | 'mooeTotal'
  | 'feTotal'
  | 'coTotal'
  | 'grandTotal'
  | 'proposedBudget'
>;

/** The program fields the public browse table reads. */
export type PublicListItem = Pick<
  PublicProgramItem,
  | 'id'
  | 'name'
  | 'status'
  | 'tentativeAipReferenceCode'
  | 'aipReferenceCode'
  | 'proposedTotal'
  | 'grandTotal'
  | 'psTotal'
  | 'mooeTotal'
  | 'feTotal'
  | 'coTotal'
  | 'papClass'
  | 'hostOffice'
  | 'finishLine'
  | 'feedbackCount'
  | 'lastUpdatedAt'
  | 'fundSources'
> & {
  office: { id: string; name: string; acronym: string } | null;
  projectActivities: PublicListActivity[];
};

/**
 * The registry response cut down to what the browse table renders (#91).
 *
 * A program's whole public record — fund splits, PAP sector, cluster, publish
 * timestamps — was serialised into the page for every program of the cycle,
 * ~620 KB for 2026. Offices start collapsed, so the first paint needs no PAs at
 * all: `withActivities: false` ships programs only, and the client loads the
 * trees when an office is first opened. A field the table starts reading has to
 * be added here, or it arrives `undefined`.
 */
export function toListItems(
  items: PublicProgramItem[],
  withActivities: boolean,
): PublicListItem[] {
  return items.map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    tentativeAipReferenceCode: p.tentativeAipReferenceCode,
    aipReferenceCode: p.aipReferenceCode,
    proposedTotal: p.proposedTotal,
    grandTotal: p.grandTotal,
    psTotal: p.psTotal,
    mooeTotal: p.mooeTotal,
    feTotal: p.feTotal,
    coTotal: p.coTotal,
    papClass: p.papClass,
    office: p.office
      ? { id: p.office.id, name: p.office.name, acronym: p.office.acronym }
      : null,
    hostOffice: p.hostOffice,
    finishLine: p.finishLine,
    feedbackCount: p.feedbackCount,
    lastUpdatedAt: p.lastUpdatedAt,
    fundSources: p.fundSources,
    projectActivities: withActivities
      ? p.projectActivities.map((a) => ({
          id: a.id,
          type: a.type,
          name: a.name,
          parentProjectActivityId: a.parentProjectActivityId,
          orderIndex: a.orderIndex,
          tentativeAipReferenceCode: a.tentativeAipReferenceCode,
          aipReferenceCode: a.aipReferenceCode,
          costMode: a.costMode,
          psTotal: a.psTotal,
          mooeTotal: a.mooeTotal,
          feTotal: a.feTotal,
          coTotal: a.coTotal,
          grandTotal: a.grandTotal,
          proposedBudget: a.proposedBudget,
        }))
      : [],
  }));
}
