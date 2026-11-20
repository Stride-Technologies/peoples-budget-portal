import type {
  FundAllocationRecord,
  PublicClusterRecord,
  PublicFinishLineRecord,
  PublicProgramItem,
  PublicRegistryProjectActivity,
} from '@/lib/api';

/**
 * Turns a cycle's published programs into the figures the Overview argues from.
 *
 * One pass, no network, no rounding surprises. The page already fetches the whole
 * cycle in a single request — grouping is only correct over the complete result
 * set — so every figure here is derived from that same array rather than from
 * six more endpoints.
 *
 * ## Money rules, and why they are not negotiable
 *
 * **A programme's amount is `proposedTotal`.** It is a stored, published-snapshot
 * aware column. Re-deriving it by summing the programme's root PAs would quietly
 * disagree with the snapshot while a revision is open.
 *
 * **Fund attribution follows the money, not the level.** `fundSources` lives on
 * whichever row states the amount. A programme that rolls up from PPAs is
 * attributed through its *root* PAs — only root, because a child's amount
 * already rolls up into its parent and counting both would inflate the total.
 * A programme that states its own costs holds **no PAs at all**, so it is its
 * own funding entry and carries its own `fundSources`. A row split by fund
 * (`fundAllocations`) is attributed line by line, exactly. Walking PAs
 * unconditionally silently dropped every one of those — 396 of the 492
 * published 2027 programmes and ₱2.54B, which is why this section once totalled
 * ₱3.53B against a ₱6.07B cycle. Either way an entry is counted once.
 *
 * **Arithmetic is in whole centavos.** Money is `Decimal(18,2)` on the wire and
 * must never round-trip through a float. At ₱1.66B a cycle the centavo count is
 * ~1.7e11, four orders of magnitude below `Number.MAX_SAFE_INTEGER`, so integer
 * arithmetic is exact here without pulling in a decimal library.
 */

/** Peso decimal string → whole centavos. */
export function centavos(value: string | null | undefined): number {
  if (!value) return 0;
  const [whole, frac = ''] = value.split('.');
  const sign = whole.startsWith('-') ? -1 : 1;
  const w = Math.abs(parseInt(whole, 10) || 0);
  const f = parseInt((frac + '00').slice(0, 2), 10) || 0;
  return sign * (w * 100 + f);
}

/** Whole centavos → peso decimal string, the shape the formatters expect. */
export function pesos(total: number): string {
  const sign = total < 0 ? '-' : '';
  const abs = Math.abs(total);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export interface OverviewSlice {
  key: string;
  label: string;
  sublabel?: string;
  amount: string;
  /** Programmes counted into this slice. */
  count: number;
  /** Identity colour, where the dimension has one. Decorative only. */
  accent?: string | null;
}

export interface OverviewCoverage {
  programCount: number;
  /** Offices with at least one published programme. */
  publishedOfficeCount: number;
  /** Offices that exist at all — the denominator the page must be honest about. */
  totalOfficeCount: number;
  totalProposed: string;
  /** Finish lines with at least one published programme, out of all of them. */
  finishLinesRepresented: number;
  finishLineCount: number;
}

export interface ExpenseMix {
  ps: string;
  mooe: string;
  fe: string;
  co: string;
  total: string;
  /** Programmes carrying any expense-class breakdown at all. */
  classifiedProgramCount: number;
}

export interface BudgetOverview {
  coverage: OverviewCoverage;
  finishLines: OverviewSlice[];
  clusters: OverviewSlice[];
  offices: OverviewSlice[];
  papClasses: OverviewSlice[];
  fundSources: OverviewSlice[];
  expenseMix: ExpenseMix;
  /** Root PAs whose fund source could not be attributed to exactly one fund. */
  fundSourceCaveats: { multiple: number; notStated: number; totalRootPAs: number };
}

/** The city's fund codes, spelled out. The Excel labels are print abbreviations. */
export const FUND_SOURCE_NAMES: Record<string, string> = {
  GF: 'General Fund',
  SEF: 'Special Education Fund',
  LDF: 'Local Development Fund',
  LDRRMF: 'Local Disaster Risk Reduction and Management Fund',
  SPA: 'Special Purpose Appropriation',
  PPP: 'Public-Private Partnership',
  NGA: 'National Government Agency',
  DONATIONS_GRANTS: 'Donations and grants',
  GAD: 'Gender and Development',
  TRUST_FUND: 'Trust Fund',
  SHF: 'Special Health Fund',
  EDF: 'Economic Development Fund',
  CCN: 'Local college fund',
  JOINT_VENTURE: 'Joint venture',
  BORROWINGS: 'Borrowings',
};

/** Buckets for PPAs whose money cannot be attributed to one named fund. */
export const FUND_MULTIPLE = '__multiple__';
export const FUND_NOT_STATED = '__not_stated__';

/**
 * A fund row's label in the visitor's language: the two synthetic buckets are
 * copy (`fund.*` in the catalogue, specs/014); a real fund's name stays as it is.
 */
export function fundBucketLabels(
  f: { key: string; label: string; sublabel?: string },
  t: (key: 'fund.multiple' | 'fund.multipleSub' | 'fund.notStated') => string,
): { label: string; sublabel?: string } {
  if (f.key === FUND_MULTIPLE) return { label: t('fund.multiple'), sublabel: t('fund.multipleSub') };
  if (f.key === FUND_NOT_STATED) return { label: t('fund.notStated') };
  return { label: f.label, sublabel: f.sublabel };
}

export const PAP_CLASS_NAMES: Record<string, string> = {
  GAS: 'General Administrative Services',
  STO: 'Support to Operations',
  OPERATIONS: 'Operations',
};

const PAP_CLASS_ORDER = ['GAS', 'STO', 'OPERATIONS'] as const;

function bySizeThenName(a: OverviewSlice, b: OverviewSlice): number {
  const diff = centavos(b.amount) - centavos(a.amount);
  return diff !== 0 ? diff : a.label.localeCompare(b.label);
}

export function buildBudgetOverview({
  items,
  finishLines,
  clusters,
  totalOfficeCount,
}: {
  items: PublicProgramItem[];
  finishLines: PublicFinishLineRecord[];
  clusters: PublicClusterRecord[];
  totalOfficeCount: number;
}): BudgetOverview {
  // Every finish line and cluster is seeded at zero before any programme is
  // counted. A dimension with nothing published is the single most important
  // thing the AIP Overview has to say — "one of eight" only reads if the other
  // seven are on the page.
  const flAccent = new Map(finishLines.map((f) => [f.id, f.color]));
  const flAmounts = new Map<string, { label: string; total: number; count: number }>(
    finishLines.map((f) => [f.id, { label: f.name, total: 0, count: 0 }]),
  );

  // A cluster's colour comes from its finish line, since clusters have none of
  // their own. Only where that mapping is unambiguous — a cluster spanning
  // several finish lines gets no dot rather than an arbitrary one.
  const flColorByVision = new Map(
    finishLines.filter((f) => f.visionNumber != null).map((f) => [f.visionNumber, f.color]),
  );
  const clusterAccent = new Map(
    clusters.map((c) => {
      const visions = c.finishLineClusters
        .map((fc) => fc.finishLine.visionNumber)
        .filter((v): v is number => v != null);
      return [
        c.id,
        visions.length === 1 ? (flColorByVision.get(visions[0]) ?? null) : null,
      ];
    }),
  );
  const clusterAmounts = new Map<string, { label: string; total: number; count: number }>(
    clusters.map((c) => [c.id, { label: c.name, total: 0, count: 0 }]),
  );

  const offices = new Map<
    string,
    { label: string; sublabel: string; total: number; count: number }
  >();
  const papClasses = new Map<string, { total: number; count: number }>();

  let ps = 0;
  let mooe = 0;
  let fe = 0;
  let co = 0;
  let classifiedProgramCount = 0;
  let totalProposed = 0;

  const funds = new Map<string, { total: number; count: number }>();
  let multipleFundPAs = 0;
  let notStatedFundPAs = 0;
  let totalRootPAs = 0;

  /** Put one entry's amount in a fund bucket. Counts the entry either way. */
  const attributeFunds = (sources: string[], amount: number) => {
    totalRootPAs += 1;

    let key: string;
    if (sources.length === 1) {
      key = sources[0];
    } else if (sources.length === 0) {
      key = FUND_NOT_STATED;
      notStatedFundPAs += 1;
    } else {
      // Amount-less by design: the row names two funds and says nothing about
      // the split, so splitting it would be invention and counting it twice
      // would inflate the total.
      key = FUND_MULTIPLE;
      multipleFundPAs += 1;
    }

    const bucket = funds.get(key) ?? { total: 0, count: 0 };
    bucket.total += amount;
    bucket.count += 1;
    funds.set(key, bucket);
  };

  /** A row that states what each fund pays: every line lands in its own fund. */
  const attributeSplit = (lines: FundAllocationRecord[]) => {
    totalRootPAs += 1;
    for (const line of lines) {
      const bucket = funds.get(line.fundSource) ?? { total: 0, count: 0 };
      bucket.total += centavos(line.ps) + centavos(line.mooe) + centavos(line.fe) + centavos(line.co);
      bucket.count += 1;
      funds.set(line.fundSource, bucket);
    }
  };

  for (const item of items) {
    const amount = centavos(item.proposedTotal);
    totalProposed += amount;

    if (item.finishLine) {
      const bucket = flAmounts.get(item.finishLine.id);
      // A finish line the /public/finish-lines list did not return still has to
      // be counted, or the page's total stops matching its own rows.
      if (bucket) {
        bucket.total += amount;
        bucket.count += 1;
      } else {
        flAmounts.set(item.finishLine.id, {
          label: item.finishLine.name,
          total: amount,
          count: 1,
        });
      }
    }

    const cluster = item.office?.cluster;
    if (cluster) {
      const bucket = clusterAmounts.get(cluster.id);
      if (bucket) {
        bucket.total += amount;
        bucket.count += 1;
      } else {
        clusterAmounts.set(cluster.id, { label: cluster.name, total: amount, count: 1 });
      }
    }

    if (item.office) {
      const existing = offices.get(item.office.id);
      if (existing) {
        existing.total += amount;
        existing.count += 1;
      } else {
        offices.set(item.office.id, {
          label: item.office.acronym,
          sublabel: item.office.name,
          total: amount,
          count: 1,
        });
      }
    }

    // A null papClass prints in the Operations section — same rule as the AIP
    // reference code, where a null emits the Operations segment.
    const papClass = item.papClass ?? 'OPERATIONS';
    const pc = papClasses.get(papClass) ?? { total: 0, count: 0 };
    pc.total += amount;
    pc.count += 1;
    papClasses.set(papClass, pc);

    const itemPs = centavos(item.psTotal);
    const itemMooe = centavos(item.mooeTotal);
    const itemFe = centavos(item.feTotal);
    const itemCo = centavos(item.coTotal);
    ps += itemPs;
    mooe += itemMooe;
    fe += itemFe;
    co += itemCo;
    if (itemPs + itemMooe + itemFe + itemCo > 0) classifiedProgramCount += 1;

    // Which entry carries the funds depends on where the money is stated. A
    // program that states its own costs holds **no PAs at all**, so walking PAs
    // attributes nothing and drops it out of the breakdown entirely — that was
    // 396 of 492 published 2027 programs and ₱2.54B, and it is why this section
    // used to total ₱3.53B against a ₱6.07B cycle.
    const rootPAs = item.projectActivities.filter(
      (pa) => pa.parentProjectActivityId === null,
    );
    if (rootPAs.length === 0) {
      if (item.fundAllocations?.length) attributeSplit(item.fundAllocations);
      else attributeFunds(item.fundSources ?? [], amount);
    } else {
      const childrenOf = (id: string) =>
        item.projectActivities.filter((pa) => pa.parentProjectActivityId === id);
      const hasSplit = (pa: PublicRegistryProjectActivity): boolean =>
        !!pa.fundAllocations?.length || childrenOf(pa.id).some(hasSplit);
      // A row split by fund is attributed line by line. A parent with a split
      // somewhere below it is walked into, so its children — which sum to it —
      // stand in for it; any other root PA is one entry, as before.
      const attribute = (pa: PublicRegistryProjectActivity) => {
        if (pa.fundAllocations?.length) attributeSplit(pa.fundAllocations);
        else if (hasSplit(pa)) childrenOf(pa.id).forEach(attribute);
        else attributeFunds(pa.fundSources ?? [], centavos(pa.proposedBudget));
      };
      rootPAs.forEach(attribute);
    }
  }

  const finishLineSlices: OverviewSlice[] = [...flAmounts.entries()]
    .map(([id, v]) => ({
      key: id,
      label: v.label,
      amount: pesos(v.total),
      count: v.count,
      accent: flAccent.get(id) ?? null,
    }))
    .sort(bySizeThenName);

  return {
    coverage: {
      programCount: items.length,
      publishedOfficeCount: offices.size,
      totalOfficeCount,
      totalProposed: pesos(totalProposed),
      finishLinesRepresented: finishLineSlices.filter((f) => f.count > 0).length,
      finishLineCount: flAmounts.size,
    },
    finishLines: finishLineSlices,
    clusters: [...clusterAmounts.entries()]
      .map(([id, v]) => ({
        key: id,
        label: v.label,
        amount: pesos(v.total),
        count: v.count,
        accent: clusterAccent.get(id) ?? null,
      }))
      .sort(bySizeThenName),
    offices: [...offices.entries()]
      .map(([id, v]) => ({
        key: id,
        label: v.label,
        sublabel: v.sublabel,
        amount: pesos(v.total),
        count: v.count,
      }))
      .sort(bySizeThenName),
    // Fixed order, not by size: these are the three sections of the printed
    // book and they always print GAS, STO, Operations.
    papClasses: PAP_CLASS_ORDER.filter((k) => papClasses.has(k)).map((k) => ({
      key: k,
      label: PAP_CLASS_NAMES[k],
      amount: pesos(papClasses.get(k)!.total),
      count: papClasses.get(k)!.count,
    })),
    fundSources: [...funds.entries()]
      .map(([key, v]) => ({
        key,
        label:
          key === FUND_MULTIPLE
            ? 'More than one fund'
            : key === FUND_NOT_STATED
              ? 'Fund not yet stated'
              : (FUND_SOURCE_NAMES[key] ?? key),
        sublabel:
          key === FUND_MULTIPLE
            ? 'The entry names several funds without splitting the amount'
            : key === FUND_NOT_STATED
              ? undefined
              : key,
        amount: pesos(v.total),
        count: v.count,
      }))
      .sort(bySizeThenName),
    expenseMix: {
      ps: pesos(ps),
      mooe: pesos(mooe),
      fe: pesos(fe),
      co: pesos(co),
      total: pesos(ps + mooe + fe + co),
      classifiedProgramCount,
    },
    fundSourceCaveats: {
      multiple: multipleFundPAs,
      notStated: notStatedFundPAs,
      totalRootPAs,
    },
  };
}
