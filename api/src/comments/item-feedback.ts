import type { Prisma } from '../generated/prisma/index.js';

/**
 * Public feedback on an enacted Ordinance lands on a `BudgetItem`, not a
 * `Program` (specs/012 D3). Staff feedback lists render a `program` on every
 * row, so an item comment carries its root PPA in that shape — the PPA the
 * public page shows — with status `ENACTED` and `budgetItemId` set, so the
 * client links to the public page instead of the program drawer.
 */
export const ITEM_FEEDBACK_SELECT = {
  select: {
    id: true,
    rootItem: { select: { id: true, name: true, aipReferenceCode: true } },
  },
} satisfies Prisma.BudgetItemDefaultArgs;

type ItemTarget = Prisma.BudgetItemGetPayload<typeof ITEM_FEEDBACK_SELECT>;

export function withFeedbackTarget<
  T extends { program: unknown; budgetItem: ItemTarget | null },
>({ budgetItem, ...row }: T) {
  return {
    ...row,
    budgetItemId: budgetItem?.id ?? null,
    program:
      row.program ??
      (budgetItem && {
        id: budgetItem.rootItem.id,
        name: budgetItem.rootItem.name,
        status: 'ENACTED',
        aipReferenceCode: budgetItem.rootItem.aipReferenceCode,
        tentativeAipReferenceCode: null,
      }),
  };
}

/** A staff office's feedback: on its programs, or on its PPAs of a document. */
export function officeFeedbackWhere(
  officeId: string,
  aipCycleId?: string,
): Prisma.ProgramCommentWhereInput {
  return {
    OR: [
      {
        program: {
          officeId,
          deletedAt: null,
          ...(aipCycleId ? { aipCycleId } : {}),
        },
      },
      {
        budgetItem: {
          officeId,
          ...(aipCycleId
            ? { document: { budgetCycle: { aipCycle: { id: aipCycleId } } } }
            : {}),
        },
      },
    ],
  };
}
