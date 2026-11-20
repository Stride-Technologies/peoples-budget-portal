import { officeFeedbackWhere, withFeedbackTarget } from './item-feedback.js';

describe('item feedback (specs/012 D3)', () => {
  const program = {
    id: 'p1',
    name: 'Program',
    status: 'PUBLISHED',
    aipReferenceCode: null,
    tentativeAipReferenceCode: '1000-001',
  };
  const budgetItem = {
    id: 'child',
    rootItem: { id: 'root', name: 'Root PPA', aipReferenceCode: '1000-1' },
  };

  it('gives an item comment its root PPA in the program shape', () => {
    expect(withFeedbackTarget({ id: 'c1', program: null, budgetItem })).toEqual(
      {
        id: 'c1',
        budgetItemId: 'child',
        program: {
          id: 'root',
          name: 'Root PPA',
          status: 'ENACTED',
          aipReferenceCode: '1000-1',
          tentativeAipReferenceCode: null,
        },
      },
    );
  });

  it('leaves a program comment as it was', () => {
    expect(withFeedbackTarget({ id: 'c2', program, budgetItem: null })).toEqual(
      { id: 'c2', program, budgetItemId: null },
    );
  });

  it('scopes both targets to the office and the cycle', () => {
    expect(officeFeedbackWhere('o1', 'cy')).toEqual({
      OR: [
        { program: { officeId: 'o1', deletedAt: null, aipCycleId: 'cy' } },
        {
          budgetItem: {
            officeId: 'o1',
            document: { budgetCycle: { aipCycle: { id: 'cy' } } },
          },
        },
      ],
    });
  });
});
