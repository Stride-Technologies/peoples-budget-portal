import { AIPCycleStatus } from '../generated/prisma/index';
import { computeSections, isAdoptedStatus } from './cycle-sections.js';

const facts = (
  fiscalYear: number,
  aipStatus: AIPCycleStatus | null,
  over: Partial<Parameters<typeof computeSections>[0]> = {},
) => ({
  fiscalYear,
  aipStatus,
  hasPublicAip: true,
  hasEnactedOrdinance: false,
  ...over,
});

describe('computeSections', () => {
  // CRITICAL (specs/012 FR-017): what the public site shows today must not move.
  it('keeps FY2026 (LOCKED, historical) in annual only', () => {
    expect(computeSections(facts(2026, AIPCycleStatus.LOCKED))).toEqual([
      'annual',
    ]);
    expect(computeSections(facts(2026, AIPCycleStatus.ADOPTED))).toEqual([
      'annual',
    ]);
  });

  it('keeps an adopted 2027 AIP in aip only', () => {
    expect(computeSections(facts(2027, AIPCycleStatus.ADOPTED))).toEqual([
      'aip',
    ]);
  });

  it('shows an AIP still being prepared even before anything is published', () => {
    for (const s of [
      AIPCycleStatus.PLANNING,
      AIPCycleStatus.OPEN,
      AIPCycleStatus.CLOSED,
    ]) {
      expect(computeSections(facts(2028, s, { hasPublicAip: false }))).toEqual([
        'aip',
      ]);
    }
  });

  it('drops an adopted AIP with nothing public from aip', () => {
    expect(
      computeSections(
        facts(2028, AIPCycleStatus.ADOPTED, { hasPublicAip: false }),
      ),
    ).toEqual([]);
  });

  it('puts a year with an AIP and an enacted Ordinance in both', () => {
    expect(
      computeSections(
        facts(2027, AIPCycleStatus.ADOPTED, { hasEnactedOrdinance: true }),
      ),
    ).toEqual(['aip', 'annual']);
  });

  it('puts a year with only an Ordinance in annual only', () => {
    expect(
      computeSections(
        facts(2025, null, { hasPublicAip: false, hasEnactedOrdinance: true }),
      ),
    ).toEqual(['annual']);
  });

  it('keeps an empty historical AIP stage out of annual until its Ordinance is enacted', () => {
    const empty = { hasPublicAip: false };
    expect(computeSections(facts(2025, AIPCycleStatus.ADOPTED, empty))).toEqual(
      [],
    );
    expect(
      computeSections(
        facts(2025, AIPCycleStatus.ADOPTED, {
          ...empty,
          hasEnactedOrdinance: true,
        }),
      ),
    ).toEqual(['annual']);
  });

  // specs/017 FR-002: FY2023–2025 are known only by the Mayor's proposal.
  it('puts a historical year with only a submitted LEP in annual', () => {
    const lepOnly = { hasPublicAip: false, hasPublicLep: true };
    expect(
      computeSections(facts(2025, AIPCycleStatus.ADOPTED, lepOnly)),
    ).toEqual(['annual']);
  });

  it('keeps a current year with only a submitted LEP out of annual', () => {
    expect(
      computeSections(
        facts(2027, AIPCycleStatus.ADOPTED, { hasPublicLep: true }),
      ),
    ).toEqual(['aip']);
  });

  it('reads LOCKED and ADOPTED alike', () => {
    expect(isAdoptedStatus(AIPCycleStatus.LOCKED)).toBe(true);
    expect(isAdoptedStatus(AIPCycleStatus.ADOPTED)).toBe(true);
    expect(isAdoptedStatus(AIPCycleStatus.CLOSED)).toBe(false);
    expect(isAdoptedStatus(null)).toBe(false);
  });
});
