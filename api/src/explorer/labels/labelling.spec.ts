import { labelRecords, scopeLabels } from '../query/loaders.js';
import { CAT } from '../test-catalogue.js';
import {
  gate,
  parseLabels,
  reviewCsv,
  reviewDecisions,
  textOf,
} from './labelling.js';

const parentOf = (id: string) => (id.includes('.') ? id.split('.')[0] : null);

describe('labelling', () => {
  it('gate: live unless very low, or modest and not backed by the vectors', () => {
    const d = gate(
      [
        {
          id: 'infrastructure.drainage-flood',
          confidence: 0.5,
          reason: 'canal',
        },
        { id: 'disaster-risk', confidence: 0.5, reason: 'flood' },
        { id: 'environment', confidence: 0.3, reason: 'river' },
        { id: 'health', confidence: 0.9, reason: 'clinic' },
      ],
      ['infrastructure', 'environment'],
      parentOf,
    );
    expect(d.map((x) => x.inReview)).toEqual([false, true, true, false]);
  });

  it('parseLabels keeps only rows of the batch and labels of the taxonomy, once each', () => {
    const out = parseLabels(
      JSON.stringify({
        rows: [
          {
            id: 'r1',
            labels: [
              { id: 'health', confidence: 2, reason: 'x' },
              { id: 'made-up', confidence: 1, reason: '' },
              { id: 'health', confidence: 0.1, reason: 'dup' },
            ],
            suggest: '',
          },
          {
            id: 'r9',
            labels: [{ id: 'health', confidence: 1, reason: '' }],
            suggest: '',
          },
        ],
      }),
      ['r1', 'r2'],
      ['health'],
    );
    expect([...out.keys()]).toEqual(['r1']);
    expect(out.get('r1')!.picks).toEqual([
      { id: 'health', confidence: 0.1, reason: 'dup' },
    ]);
  });

  it('review sheet round-trips: quotes, commas and newlines survive; none = Not classified', () => {
    const csv = reviewCsv([
      {
        rowId: 'a',
        rowKind: 'aip-pa',
        text: 'Desilting, "Naga River"\nphase 2',
        picks: [
          {
            id: 'environment',
            confidence: 0.2,
            reason: 'river',
            inReview: true,
          },
        ],
      },
      { rowId: 'b', rowKind: 'object-line', text: 'Other supplies', picks: [] },
    ])
      .split('\n')
      .map((l, i) =>
        i === 2
          ? l.replace(/,$/, ',infrastructure.drainage-flood disaster-risk')
          : i === 3
            ? l.replace(/,$/, ',none')
            : l,
      )
      .join('\n');
    const d = reviewDecisions(csv, [
      'infrastructure.drainage-flood',
      'disaster-risk',
      'environment',
    ]);
    expect(d.get('a')).toEqual([
      'infrastructure.drainage-flood',
      'disaster-risk',
    ]);
    expect(d.get('b')).toEqual([]);
    expect(() =>
      reviewDecisions(csv.replace('disaster-risk', 'nope'), [
        'infrastructure.drainage-flood',
      ]),
    ).toThrow(/unknown label/);
  });

  it('a row text says what it is and where it sits, and skips empty fields', () => {
    expect(
      textOf.activity({
        name: 'Desilting of Waterways',
        kind: 'Activity',
        description: ' ',
        parents: ['Slope Protections and Flood Management'],
        office: "City Engineer's Office",
        classes: ['Capital Outlay'],
      }),
    ).toBe(
      "Activity: Desilting of Waterways\nPart of: Slope Protections and Flood Management\nOffice: City Engineer's Office\nMoney in: Capital Outlay",
    );
  });
});

describe('labelRecords', () => {
  it('a sub-label brings its label; unlisted labels are dropped; nothing → Not classified; own labels before children’s', () => {
    const rec = (id: string) => ({ dims: { rowId: id }, money: {} });
    const out = labelRecords(
      [rec('p1'), rec('p2'), rec('p3')],
      [
        {
          key: 'p1',
          own: false,
          labelId: 'infrastructure.drainage-flood',
          parentId: 'infrastructure',
        },
        { key: 'p1', own: false, labelId: 'health', parentId: null },
        { key: 'p2', own: false, labelId: 'sports', parentId: null },
        // p3's own label wins over its child's
        { key: 'p3', own: true, labelId: 'health', parentId: null },
        { key: 'p3', own: false, labelId: 'infrastructure', parentId: null },
      ],
      CAT,
    );
    expect(out.map((r) => [r.dims.label, r.dims.subLabel])).toEqual([
      [['health', 'infrastructure'], ['infrastructure.drainage-flood']],
      [['unclassified'], []],
      [['health'], []],
    ]);
  });
});

describe('scopeLabels', () => {
  it('under a label filter, a breakdown shows only that label and its sub-labels', () => {
    const r = {
      dims: {
        rowId: 'p1',
        label: ['health', 'infrastructure'],
        subLabel: ['health.hospital-care', 'infrastructure.buildings'],
      },
      money: {},
    };
    const q = {
      source: 'aip-programs' as const,
      documents: [{ kind: 'aip' as const, years: [2027] }],
      dimensions: ['label', 'subLabel'],
      measures: [{ field: 'amount', agg: 'sum' as const }],
      filters: [
        { field: 'label', op: 'in' as const, values: ['infrastructure'] },
      ],
    };
    expect(scopeLabels([r], q)[0].dims).toEqual({
      rowId: 'p1',
      label: ['infrastructure'],
      subLabel: ['infrastructure.buildings'],
    });
    expect(scopeLabels([r], { ...q, filters: [] })[0]).toBe(r);
  });
});
