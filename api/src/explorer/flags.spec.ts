import { classFlags, ppaFlags, type YearRow } from './flags.js';

const r = (
  office: string,
  key: string,
  year: number,
  amount: string,
): YearRow => ({
  office,
  key,
  year,
  amount,
});

describe('unusual-change flags (specs/020 B5.2)', () => {
  const Y: [number, number] = [2026, 2027];

  it('flags a PPA that tripled by at least ₱1M, worded as a question', () => {
    const f = ppaFlags(
      [
        r('CEO', 'Drainage', 2026, '1000000.00'),
        r('CEO', 'Drainage', 2027, '3500000.00'),
        r('CEO', 'Small', 2026, '100000.00'),
        r('CEO', 'Small', 2027, '900000.00'), // ×9 but under ₱1M of change
        r('CHO', 'New clinic', 2027, '50000000.00'), // new: nothing to compare
      ],
      Y,
    );
    expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({
      rule: 'tripled',
      office: 'CEO',
      subject: 'Drainage',
    });
    expect(f[0].note).toBe(
      'Unusual change — ask the office: from ₱1.00M in 2026 to ₱3.50M in 2027 (×3.5).',
    );
    expect(f[0].note).not.toMatch(/fraud|suspicious|anomal|irregular/i);
  });

  it('flags a rise of half or more to a round ₱5M+ figure, not a costed one', () => {
    const f = ppaFlags(
      [
        r('GSO', 'Vehicles', 2026, '4000000.00'),
        r('GSO', 'Vehicles', 2027, '10000000.00'),
        r('GSO', 'Fuel', 2026, '4000000.00'),
        r('GSO', 'Fuel', 2027, '10000437.50'),
      ],
      Y,
    );
    expect(f.map((x) => [x.subject, x.rule])).toEqual([
      ['Vehicles', 'round-spike'],
    ]);
  });

  it('sums duplicate keys within a year before comparing', () => {
    const f = ppaFlags(
      [
        r('CEO', 'Roads', 2026, '1000000.00'),
        r('CEO', 'Roads', 2027, '1500000.00'),
        r('CEO', 'Roads', 2027, '1600000.00'),
      ],
      Y,
    );
    expect(f[0]).toMatchObject({ rule: 'tripled', cur: '3100000.00' });
  });

  it('flags an expense class an office barely used the year before', () => {
    const f = classFlags(
      [
        r('CSWDO', 'Personnel Services', 2026, '20000000.00'),
        r(
          'CSWDO',
          'Maintenance and Other Operating Expenses',
          2026,
          '9500000.00',
        ),
        r('CSWDO', 'Capital Outlay', 2026, '500000.00'), // 1.7%
        r('CSWDO', 'Capital Outlay', 2027, '8000000.00'),
        r('CSWDO', 'Personnel Services', 2027, '21000000.00'),
      ],
      Y,
    );
    expect(f.map((x) => x.subject)).toEqual(['Capital Outlay']);
    expect(f[0].note).toContain('was 1.7% of');
  });
});
