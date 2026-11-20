import { Prisma } from '../generated/prisma/index';
import { climateBudgetBasis } from './climate-tags.service';
import {
  climateWarnings,
  isProvenanceWarning,
  uncodedClimateTags,
} from '../programs/import-data-warnings';

const D = (v: string) => new Prisma.Decimal(v);

describe('climate tags', () => {
  it('measures CCA+CCM against the proposed budget, line items only when there is none', () => {
    expect(climateBudgetBasis(D('500000'), []).toFixed(2)).toBe('500000.00');
    expect(climateBudgetBasis(null, [D('10'), D('5')]).toFixed(2)).toBe(
      '15.00',
    );
  });

  const tag = (
    owner: string,
    cca: string,
    codeCount: number,
    budget: string | null,
  ) => ({
    owner,
    ccaAmount: D(cca),
    ccmAmount: D('0'),
    codeCount,
    budget: budget === null ? null : D(budget),
  });

  it('blocks an amount with no code, but not a code-only or empty tag', () => {
    const tags = [
      tag('HSDO drainage', '4000000', 0, '4000000'),
      tag('coded', '1', 1, '1'),
      tag('code only', '0', 0, '0'),
    ];
    expect(uncodedClimateTags(tags).map((t) => t.owner)).toEqual([
      'HSDO drainage',
    ]);
  });

  it('warns, without blocking, when climate spending exceeds the row', () => {
    const warnings = climateWarnings([
      tag('Conversion of Nursery', '1061000', 2, '601000'),
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('more than its proposed amount');
    expect(uncodedClimateTags([tag('x', '1061000', 2, '601000')])).toHaveLength(
      0,
    );
  });

  it('keeps the unmatched-code import warning as provenance', () => {
    expect(
      isProvenanceWarning(
        'The workbook gives a climate typology code that is not in the local CCET typology: "A524-01" on "x".',
      ),
    ).toBe(true);
  });
});
