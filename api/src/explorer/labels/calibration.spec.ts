import {
  bootstrap,
  calibrated,
  crossFitted,
  disagreement,
  ece,
  fitIsotonic,
  officeOf,
  readGold,
  reviewOrder,
  reviewThreshold,
  scorePicks,
  stratifiedSample,
  type Scored,
} from './calibration.js';
import { gate, parseCsv } from './labelling.js';

const pts = (xs: [number, 0 | 1][]): Scored[] =>
  xs.map(([confidence, c]) => ({ confidence, correct: !!c }));

describe('gold set (B1.2)', () => {
  const rows = [
    ...Array.from({ length: 80 }, (_, i) => ({ id: `a${i}`, office: 'CEO' })),
    ...Array.from({ length: 18 }, (_, i) => ({ id: `b${i}`, office: 'CHO' })),
    { id: 'c0', office: 'CTO' },
    { id: 'd0', office: 'CPDO' },
  ];
  const draw = (n: number, seed?: string) =>
    stratifiedSample(
      rows,
      (r) => r.id,
      (r) => r.office,
      n,
      seed,
    );

  it('takes exactly n, every office at least once, roughly in proportion', () => {
    const s = draw(20);
    expect(s).toHaveLength(20);
    const by = (o: string) => s.filter((r) => r.office === o).length;
    expect(by('CTO')).toBe(1);
    expect(by('CPDO')).toBe(1);
    expect(by('CEO')).toBeGreaterThan(by('CHO'));
    expect(new Set(s.map((r) => r.id)).size).toBe(20);
  });

  it('is deterministic for a seed and different for another', () => {
    expect(draw(20).map((r) => r.id)).toEqual(draw(20).map((r) => r.id));
    expect(draw(20, 'other').map((r) => r.id)).not.toEqual(
      draw(20).map((r) => r.id),
    );
  });

  it('returns everything when n is the population or more', () => {
    expect(draw(500)).toHaveLength(rows.length);
  });

  it('reads the office line the row text carries', () => {
    expect(officeOf('Program: X\nOffice: City Health Office\nSector: y')).toBe(
      'City Health Office',
    );
    expect(officeOf('Program: X')).toBe('(none)');
  });
});

describe('calibration (B1.3)', () => {
  it('isotonic fit is non-decreasing and pools violators', () => {
    const c = fitIsotonic(
      pts([
        [0.2, 0],
        [0.3, 1],
        [0.4, 0],
        [0.6, 1],
        [0.6, 0],
        [0.9, 1],
        [0.95, 1],
      ]),
    );
    for (let i = 1; i < c.y.length; i++)
      expect(c.y[i]).toBeGreaterThanOrEqual(c.y[i - 1]);
    // 0.3 (right) then 0.4 (wrong) violate order and are pooled to 0.5.
    expect(calibrated(c, 0.35)).toBeCloseTo(0.5);
    expect(calibrated(c, 0.1)).toBe(0);
    expect(calibrated(c, 0.99)).toBe(1);
    expect(c.n.reduce((a, b) => a + b, 0)).toBe(7);
  });

  it('sets the threshold at the lowest confidence that meets the target error', () => {
    const c = fitIsotonic(
      pts([
        [0.3, 0],
        [0.3, 0],
        [0.5, 1],
        [0.5, 0],
        [0.7, 1],
        [0.7, 1],
        [0.7, 1],
        [0.7, 0],
        [0.9, 1],
      ]),
    );
    expect(reviewThreshold(c, 0.5)).toBe(0.5);
    expect(reviewThreshold(c, 0.25)).toBe(0.7);
    expect(reviewThreshold(c, 0)).toBe(0.9);
    expect(reviewThreshold(fitIsotonic(pts([[0.9, 0]])), 0.1)).toBe(1.01);
  });

  it('calibration lowers ECE on an over-confident model', () => {
    // Says 0.9, right half the time.
    const p = pts(
      Array.from({ length: 100 }, (_, i) => [0.9, (i % 2) as 0 | 1]),
    );
    const c = fitIsotonic(p);
    expect(ece(p)).toBeCloseTo(0.4);
    expect(ece(p, (x) => calibrated(c, x))).toBeCloseTo(0);
  });

  it('bootstrap interval brackets the statistic and is reproducible', () => {
    const xs = Array.from({ length: 200 }, (_, i) => i % 3 === 0);
    const mean = (s: boolean[]) => s.filter(Boolean).length / s.length;
    const a = bootstrap(xs, mean, 500);
    expect(a.lo).toBeLessThanOrEqual(a.value);
    expect(a.hi).toBeGreaterThanOrEqual(a.value);
    expect(bootstrap(xs, mean, 500)).toEqual(a);
  });

  it('scores each pick against the gold labels', () => {
    expect(
      scorePicks([
        {
          rowId: 'r',
          picks: [
            { id: 'health', confidence: 0.8 },
            { id: 'roads', confidence: 0.4 },
          ],
          gold: ['health'],
        },
      ]),
    ).toEqual([
      { confidence: 0.8, correct: true },
      { confidence: 0.4, correct: false },
    ]);
  });

  it('gate takes the calibrated threshold in place of REVIEW_BELOW', () => {
    const picks = [{ id: 'health', confidence: 0.5, reason: '' }];
    expect(gate(picks, ['health'], () => null)[0].inReview).toBe(false);
    expect(gate(picks, ['health'], () => null, 0.7)[0].inReview).toBe(true);
  });
});

describe('review order (B1.4)', () => {
  const v = (x: number, y: number) => {
    const n = Math.hypot(x, y);
    return [x / n, y / n];
  };
  const pool = [
    { vec: v(1, 0), labels: ['health'] },
    { vec: v(1, 0.1), labels: ['health'] },
    { vec: v(0, 1), labels: ['roads'] },
    { vec: v(0.1, 1), labels: ['roads'] },
  ];

  it('disagreement is the share of nearest neighbours sharing none of the labels', () => {
    const row = {
      rowId: 'x',
      vec: v(1, 0.05),
      labels: ['roads'],
      certainty: 0.9,
    };
    expect(disagreement(row, pool, 2)).toBe(1);
    expect(disagreement({ ...row, labels: ['health'] }, pool, 2)).toBe(0);
    expect(disagreement({ ...row, labels: [] }, pool, 2)).toBe(0);
  });

  it('puts the row its neighbours contradict first, then the least certain', () => {
    const rows = [
      { rowId: 'sure', vec: v(1, 0), labels: ['health'], certainty: 0.95 },
      { rowId: 'unsure', vec: v(0, 1), labels: ['roads'], certainty: 0.3 },
      { rowId: 'odd', vec: v(1, 0.05), labels: ['roads'], certainty: 0.9 },
    ];
    expect(reviewOrder(rows, pool, { k: 2 }).map((r) => r.rowId)).toEqual([
      'odd',
      'unsure',
      'sure',
    ]);
  });

  it('keeps the queue diverse: a near-duplicate waits behind a different row', () => {
    const rows = [
      { rowId: 'a', vec: v(1, 0), labels: [], certainty: 0.2 },
      { rowId: 'a2', vec: v(1, 0.001), labels: [], certainty: 0.21 },
      { rowId: 'b', vec: v(0, 1), labels: [], certainty: 0.3 },
    ];
    expect(
      reviewOrder(rows, pool, { lambda: 0.5 }).map((r) => r.rowId),
    ).toEqual(['a', 'b', 'a2']);
  });
});

describe('readGold', () => {
  it('reads picks and decisions from a filled sheet, skipping undecided rows', () => {
    const csv = [
      'row_id,kind,office,text,proposed,picks,decision',
      'a,aip-pa,CEO,"x",p,"[{""id"":""roads"",""confidence"":0.8}]",roads health',
      'b,aip-pa,CEO,"y",p,"[{""id"":""health"",""confidence"":0.4}]",none',
      'c,aip-pa,CEO,"z",p,"[]",',
    ].join('\n');
    expect(readGold(csv, parseCsv)).toEqual([
      {
        rowId: 'a',
        picks: [{ id: 'roads', confidence: 0.8 }],
        gold: ['roads', 'health'],
      },
      { rowId: 'b', picks: [{ id: 'health', confidence: 0.4 }], gold: [] },
    ]);
  });
});

describe('crossFitted', () => {
  it('scores every pick once, each with a curve that never saw its row', () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
      rowId: `r${i}`,
      picks: [{ id: 'x', confidence: 0.9 }],
      gold: i % 4 ? ['x'] : [],
    }));
    const out = crossFitted(rows, 5);
    expect(out).toHaveLength(40);
    for (const o of out) expect(o.p).toBeGreaterThan(0.5);
  });
});
