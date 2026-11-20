/**
 * The local budget cycle, stage by stage, in plain language.
 *
 * One source for two surfaces: `/learn` explains every stage (diagram + panel),
 * and the home page says where each live budget is. The stage model and its
 * reasoning are in `docs/design/budget-cycle-stages.md`; keep the two in step.
 *
 * One fiscal year's budget takes about two calendar years, from consultations to
 * the audit, so two budgets are always live at once. `liveBudgets` says which
 * stage each is at, read from each Budget Cycle's `currentStage` — staff set it
 * in the control panel (specs/012), and both surfaces follow.
 *
 * Statements still waiting on the city's confirmation are written as
 * `{ unconfirmed, fallback }` rather than plain text. Dev and staging show them
 * highlighted, for review; production renders the fallback instead, so an
 * unconfirmed claim cannot reach the public by a staging → main merge. An empty
 * fallback drops the statement, or the whole "who" row it sits in.
 */

export interface Unconfirmed {
  unconfirmed: string;
  fallback: string;
}

/** Plain text, or a run of text with unconfirmed pieces in it. */
export type Copy = string | readonly (string | Unconfirmed)[];

export type Lane = 'plan' | 'budget' | 'decide';

export interface BudgetStage {
  n: number;
  lane: Lane;
  /** Plain-language name. */
  title: string;
  /** One line under the title in the diagram. */
  short: string;
  /** What the official documents call it. */
  official: string;
  /**
   * When it happens for the budget of fiscal year `fy`, as a template:
   * `{fy}`, `{prev}` (fy − 1) and `{next}` (fy + 1). Read it with `whenFor`.
   * A template rather than a function so it can be translated (specs/014).
   */
  when: string;
  /** One sentence for the home page. */
  summary: string;
  what: Copy;
  who: readonly { name: string; role: Copy }[];
  out: readonly { name: string; meaning: string }[];
  you: Copy;
  know: Copy;
  /**
   * The stage's box in the diagram's 692×860 viewBox. `lines` overrides how the
   * title and short line wrap, for the one box tall enough to need it.
   */
  box: {
    x: number;
    y: number;
    w: number;
    h: number;
    lines?: { title: string[]; short: string[] };
  };
}

export const LANE_LABEL: Record<Lane, string> = {
  plan: 'Planning',
  budget: 'Budget & spending',
  decide: 'Deciding & checking',
};

export const LANE_PEOPLE: Record<Lane, string> = {
  plan: '{lguAdj} planners, the development council, civil society organizations',
  budget: 'budget office, finance committee, {lguAdj} offices',
  decide: '{Mayor}, {lguAdj} council, national government',
};

/** The year the `/learn` diagram walks through. */
export const EXAMPLE_FY = 2027;

export interface LiveBudget {
  fiscalYear: number;
  /** The stage that best describes where this budget is. */
  stage: number;
  /**
   * Other stages still under way beside it. Stages overlap (the plan and the
   * budget are worked on together; spending and reporting run together).
   */
  alongside: readonly number[];
}

/**
 * Where each live budget is now: the two newest fiscal years — one being made,
 * one being spent — at the stage staff set on their Budget Cycle. Empty when
 * the cycles could not be loaded; callers render nothing rather than a guess.
 */
export function liveBudgets(
  cycles: readonly { fiscalYear: number; currentStage: number; alongsideStages: readonly number[] }[],
): LiveBudget[] {
  return [...cycles]
    .sort((a, b) => b.fiscalYear - a.fiscalYear)
    .slice(0, 2)
    .map((c) => ({ fiscalYear: c.fiscalYear, stage: c.currentStage, alongside: c.alongsideStages }));
}

/**
 * The ten stages grouped into the six the home page has always shown, under
 * their original names. The grouping and dates follow the ten stages, so the
 * home page and /learn cannot disagree; the detail lives on /learn.
 */
export interface BudgetPhase {
  title: string;
  stages: readonly number[];
  /** A `whenFor` template, as on `BudgetStage`. */
  when: string;
}

/** A stage's or phase's `when` for the budget of fiscal year `fy`. */
export function whenFor(template: string, fy: number): string {
  return template
    .replaceAll('{prev}', String(fy - 1))
    .replaceAll('{next}', String(fy + 1))
    .replaceAll('{fy}', String(fy));
}

export const BUDGET_PHASES: readonly BudgetPhase[] = [
  { title: 'Capacity Workshops and Sectoral Consultations', stages: [0], when: 'March to June {prev}' },
  { title: 'Preparation of the Annual Investment Program (AIP)', stages: [1, 2], when: 'April to October {prev}' },
  { title: 'Local Expenditure Program (LEP) Preparation', stages: [3, 4], when: 'July to October {prev}' },
  { title: 'Budget Hearings and Legislative Authorization', stages: [5, 6], when: 'October to December {prev}' },
  { title: 'Budget Review and Allotment', stages: [7], when: 'January to March {fy}' },
  { title: 'Budget Execution and Monitoring', stages: [8, 9], when: '{fy} to mid-{next}' },
];

export type StageState = 'done' | 'now' | 'upcoming';

/** Every stage under way is "now"; before the earliest is done; the rest upcoming. */
export function stageState(b: LiveBudget, n: number): StageState {
  const now = [b.stage, ...b.alongside];
  if (now.includes(n)) return 'now';
  return n < Math.min(...now) ? 'done' : 'upcoming';
}

const A = 102; // column x: planning
const B = 296; // budget & spending
const C = 490; // deciding & checking
const W = 168;

export const BUDGET_STAGES: readonly BudgetStage[] = [
  {
    n: 0,
    lane: 'plan',
    title: 'Listening to the {lgu}',
    short: 'consultations',
    official: 'Consultations',
    when: 'March to June {prev}',
    summary:
      'Offices, barangays and civil society organizations (CSOs) talk about what the {lgu} most needs next year.',
    what: 'Before any amount is written down, {lguAdj} offices, barangays and civil society organizations (CSOs) meet to talk about what {shortName} most needs next year. What they hear becomes a list of priorities for the plan.',
    who: [
      { name: '{LguAdj} Planning and Development Office', role: 'runs the planning side and keeps the record' },
      { name: 'Civil society organizations (CSOs)', role: 'accredited groups that speak for a sector or a community' },
      { name: 'Barangays', role: 'bring the needs of their area' },
    ],
    out: [{ name: 'List of priorities', meaning: 'what residents and their groups want the {lgu} to act on' }],
    you: [
      'This is the easiest moment to change what the {lgu} plans. ',
      {
        unconfirmed: 'Take part through an accredited CSO, or your barangay’s consultation.',
        fallback: 'Ask your barangay or the planning office how to join this year’s consultations.',
      },
    ],
    know: 'The Local Government Code gives accredited CSOs at least a quarter of the seats on the development council. Some LGUs add their own ordinances on top of that.',
    box: { x: A, y: 92, w: W, h: 64 },
  },
  {
    n: 1,
    lane: 'plan',
    title: 'Offices write plans',
    short: 'with price tags',
    official: 'Preparing the Annual Investment Program (AIP)',
    when: 'April to October {prev}',
    summary:
      'Every {lguAdj} office lists what it plans to do next year and what it would cost.',
    what: 'Every {lguAdj} office lists the programs, projects and activities it wants to carry out next year, and estimates what each would cost. The planning office puts them together into one document, the Annual Investment Program.',
    who: [
      { name: 'Every {lguAdj} office', role: 'proposes its own programs and costs' },
      { name: '{LguAdj} Planning and Development Office', role: 'combines and checks them' },
    ],
    out: [{ name: 'Draft Annual Investment Program (AIP)', meaning: 'every proposed program, who runs it, when, and what it would cost' }],
    you: 'Read the proposals on this site and send feedback on any program. Every program page has a feedback form.',
    know: 'The AIP is a plan with price tags, not money yet. This is what the AIP pages on this site show.',
    box: { x: A, y: 200, w: W, h: 64 },
  },
  {
    n: 2,
    lane: 'plan',
    title: 'The plan is approved',
    short: 'development council',
    official: 'Adopting the AIP',
    when: 'October {prev}, for the {fy} budget',
    summary: 'The {LguAdj} Development Council approves the plan.',
    what: [
      'The {LguAdj} Development Council reviews the plan and approves it. ',
      { unconfirmed: 'The {lguAdj} council then adopts it by resolution. ', fallback: '' },
      'From here on, a program generally has to be in the AIP to receive money in the budget.',
    ],
    who: [
      { name: '{LguAdj} Development Council', role: 'chaired by the {Mayor}, with barangay captains and CSO representatives' },
      {
        name: '{LguAdj} council ({council})',
        role: [{ unconfirmed: 'adopts the approved plan', fallback: '' }],
      },
    ],
    out: [{ name: 'Approved AIP', meaning: 'the list of programs the budget may fund' }],
    you: 'CSO representatives on the Development Council speak for residents here. Ask the planning office who represents your sector.',
    know: 'By the book this happens mid-year, before the budget is built.',
    box: { x: A, y: 306, w: W, h: 64 },
  },
  {
    n: 3,
    lane: 'budget',
    title: 'Fitting plans to the money',
    short: 'budget call, proposals, hearings',
    official: 'Budget preparation',
    when: 'July to October {prev}',
    summary:
      'Offices’ requests are cut until they fit the money the {lgu} expects to collect.',
    what: 'The Treasurer and Assessor estimate how much the {lgu} will collect next year. The {Mayor} then sends every office a Budget Call: how much it may ask for, and how. Offices submit their budget proposals, and the Local Finance Committee holds a hearing with each office to cut the requests until they fit.',
    who: [
      { name: 'Local Finance Committee', role: 'the heads of planning, budget and treasury' },
      { name: '{LguAdj} Budget Office', role: 'issues the Budget Call and combines the proposals' },
      { name: '{LguAdj} Treasurer and {LguAdj} Assessor', role: 'estimate the {lgu}’s income' },
      { name: 'Every {lguAdj} office', role: 'submits a proposal and defends it' },
    ],
    out: [
      { name: 'Budget Call', meaning: 'the instructions and spending limits sent to every office' },
      { name: 'Budget proposals', meaning: 'each office’s request for money' },
      { name: 'Draft procurement plans (PPMP)', meaning: 'what each office expects to buy, prepared with its proposal' },
    ],
    you: 'These hearings are internal to the {lguAdj} government. The best way in is earlier, through the plan, or later, at the {lguAdj} council’s hearings.',
    know: 'This is where many AIP amounts change. It happens at the same time as stages 1 and 2: the plan and the budget are adjusted back and forth until they agree.',
    box: {
      x: B,
      y: 200,
      w: W,
      h: 170,
      lines: {
        title: ['Fitting plans', 'to the money'],
        short: ['budget call,', 'office proposals,', 'finance hearings'],
      },
    },
  },
  {
    n: 4,
    lane: 'decide',
    title: 'Budget goes to council',
    short: 'legal deadline in October',
    official: 'Submitting the Executive Budget',
    when: 'October {prev}',
    summary: 'The {Mayor} sends the proposed budget to the {lguAdj} council.',
    what: 'The {Mayor} submits the proposed budget to the {lguAdj} council, with a Budget Message explaining its priorities. The law sets an October deadline for this every year.',
    who: [
      { name: '{Mayor}', role: 'submits the budget and the Budget Message' },
      { name: '{LguAdj} Budget Office and Local Finance Committee', role: 'prepare it' },
    ],
    out: [
      { name: 'Executive Budget, also called the Local Expenditure Program (LEP)', meaning: 'the {Mayor}’s proposed budget, organized by office and type of expense' },
      { name: 'Budget Message', meaning: 'the {Mayor}’s explanation of what the budget is for' },
    ],
    you: 'Once submitted, the proposed budget can be read and discussed in public. This site will show how each item changed between the plan and this proposal.',
    know: 'The LEP is arranged by office and type of expense (salaries, supplies, equipment), not by program, so it looks different from the AIP even where the money is the same.',
    box: { x: C, y: 440, w: W, h: 64 },
  },
  {
    n: 5,
    lane: 'decide',
    title: 'The council debates',
    short: 'hearings, then a vote',
    official: 'Legislative authorization: passing the Appropriation Ordinance',
    when: 'October to December {prev}',
    summary:
      'The {lguAdj} council holds hearings on the budget, then votes on it.',
    what: 'The {lguAdj} council’s committee holds hearings where each office explains and defends its budget. Council members question the requests and can cut items. The council then votes to pass the budget as an Appropriation Ordinance and sends it to the {Mayor}.',
    who: [
      { name: '{LguAdj} council ({council})', role: 'holds the hearings and votes on the budget' },
      { name: '{LguAdj} offices', role: 'explain and defend their budgets at the hearings' },
    ],
    out: [{ name: 'Appropriation Ordinance, as passed', meaning: 'the budget the council approved, sent to the {Mayor} to sign' }],
    you: [
      {
        unconfirmed: 'The council’s budget hearings are open to the public. ',
        fallback: 'Ask the {lguAdj} council’s secretariat when the budget hearings are held and how to attend. ',
      },
      'This is the last chance to speak before the figures become law.',
    ],
    know: 'The law asks the council to give the budget priority, so that it is passed before the year starts.',
    box: { x: C, y: 536, w: W, h: 64 },
  },
  {
    n: 6,
    lane: 'decide',
    title: 'The {Mayor} signs',
    short: 'or vetoes items',
    official: 'Approval by the {Mayor} (Local Chief Executive)',
    when: 'December {prev}, before the year starts',
    summary:
      'The {Mayor} signs the budget, or vetoes items in it. Signed, it is the Annual Budget.',
    what: 'The {Mayor} signs the budget the council passed, or vetoes particular items in it. If the {Mayor} does not act within ten days, it takes effect as if signed. Once signed, the plan becomes the Annual Budget: permission to spend, in law.',
    who: [
      { name: '{Mayor}', role: 'signs the ordinance, or vetoes specific items' },
      { name: '{LguAdj} council', role: 'can still pass a vetoed item if two-thirds of its members vote to override' },
    ],
    out: [
      { name: 'Appropriation Ordinance, signed', meaning: 'the Annual Budget: what the {lgu} may spend next year, by law' },
      { name: 'Veto message, if any', meaning: 'which items the {Mayor} rejected, and why' },
    ],
    you: 'There is no public step here, but the signed budget is a public record. This site shows it in the Annual Budget pages.',
    know: 'If no budget takes effect by January, the {lgu} runs on last year’s budget, for essential costs only, until the new one does.',
    box: { x: C, y: 632, w: W, h: 64 },
  },
  {
    n: 7,
    lane: 'decide',
    title: 'A national check',
    short: 'within 90 days',
    official: 'Budget review by the Department of Budget and Management (DBM)',
    when: 'January to March {fy}',
    summary:
      'The national budget department checks the budget follows the rules.',
    what: 'The Department of Budget and Management’s regional office checks that the budget follows national rules, such as the limit on spending for salaries and the required shares for development and disaster funds. It has 90 days.',
    who: [
      { name: 'DBM regional office', role: 'reviews the ordinance of a province, a highly urbanized city or an independent component city' },
      { name: '{LguAdj} Budget Office', role: 'answers its questions' },
    ],
    out: [{ name: 'Review result', meaning: 'any item that breaks the rules can be declared without effect' }],
    you: 'There is no public step here. The review result is part of the {lgu}’s budget record.',
    know: 'The {lgu} can already spend from January while this review is going on. For a component city or a municipality, the provincial council (Sangguniang Panlalawigan) does this review instead.',
    box: { x: C, y: 744, w: W, h: 64 },
  },
  {
    n: 8,
    lane: 'budget',
    title: 'Spending the money',
    short: 'buying and building',
    official: 'Budget execution',
    when: 'January to December {fy}',
    summary: 'Offices carry out their programs, buy what they need, and pay for it.',
    what: 'Offices carry out their programs. Each finalizes what it will buy, the Bids and Awards Committee combines these into the {lgu}’s procurement plan and runs public bidding, and money is released as work is done.',
    who: [
      { name: '{LguAdj} offices', role: 'carry out the programs' },
      { name: 'Bids and Awards Committee (BAC)', role: 'runs public bidding for what the {lgu} buys' },
      { name: '{LguAdj} Budget Office, Accounting and Treasury', role: 'release and record the money' },
    ],
    out: [
      { name: 'Final procurement plans (PPMP)', meaning: 'what each office will actually buy' },
      { name: 'Annual Procurement Plan (APP)', meaning: 'every planned purchase of the {lgu}, in one list' },
      { name: 'Supplemental budgets', meaning: 'new ordinances that change the budget during the year' },
    ],
    you: 'Observers from CSOs can sit in on public bidding. The Projects pages on this site show what offices plan to buy.',
    know: 'A budget line is permission, not spending. And the budget can still change during the year, but only through another ordinance passed by the council.',
    box: { x: B, y: 744, w: W, h: 64 },
  },
  {
    n: 9,
    lane: 'plan',
    title: 'Showing the receipts',
    short: 'reports and the audit',
    official: 'Budget accountability',
    when: '{fy} to mid-{next}',
    summary: 'The {lgu} reports what it spent, and the Commission on Audit checks it.',
    what: 'The {lgu} reports what it spent against what was approved, the planning office checks how projects are progressing, and the Commission on Audit examines the accounts and publishes an audit report after the year ends.',
    who: [
      { name: '{LguAdj} Accounting and Budget offices', role: 'report what was spent' },
      { name: '{LguAdj} Planning and Development Office', role: 'monitors projects' },
      { name: 'Commission on Audit (COA)', role: 'audits the accounts' },
    ],
    out: [
      { name: 'Spending reports', meaning: 'what was spent against what was approved' },
      { name: 'Annual audit report', meaning: 'COA’s findings on the {lgu}’s accounts, published online' },
    ],
    you: 'Read the {lgu}’s audit report on the COA website, and compare it with what was planned on this site.',
    know: 'This is where you can check whether permission became something you can see.',
    box: { x: A, y: 744, w: W, h: 64 },
  },
];

export interface CopyPart {
  text: string;
  unconfirmed: boolean;
}

/**
 * Resolve copy for the current build. Production swaps every unconfirmed piece
 * for its fallback; elsewhere it stays, marked, so reviewers can see it.
 */
export function resolveCopy(copy: Copy, isProd: boolean): CopyPart[] {
  const parts = typeof copy === 'string' ? [copy] : copy;
  return parts
    .map((p) =>
      typeof p === 'string'
        ? { text: p, unconfirmed: false }
        : isProd
          ? { text: p.fallback, unconfirmed: false }
          : { text: p.unconfirmed, unconfirmed: true },
    )
    .filter((p) => p.text !== '');
}

/** A stage's "who" rows, minus any whose role resolved to nothing. */
export function visibleWho(stage: BudgetStage, isProd: boolean) {
  return stage.who
    .map((w) => ({ name: w.name, role: resolveCopy(w.role, isProd) }))
    .filter((w) => w.role.length > 0);
}

/** Does any copy in this stage still wait on the city? */
export function hasUnconfirmed(stage: BudgetStage): boolean {
  const all: Copy[] = [stage.what, stage.you, stage.know, ...stage.who.map((w) => w.role)];
  return all.some((c) => typeof c !== 'string' && c.some((p) => typeof p !== 'string'));
}

/** `#stage-3` → 3, for deep links; null for anything else. */
export function stageFromHash(hash: string): number | null {
  const m = /^#stage-(\d+)$/.exec(hash);
  if (!m) return null;
  const n = Number(m[1]);
  return n < BUDGET_STAGES.length ? n : null;
}

/** A phase is under way if any of its stages is; done once all of them are. */
export function phaseState(b: LiveBudget, phase: BudgetPhase): StageState {
  const states = phase.stages.map((n) => stageState(b, n));
  if (states.includes('now')) return 'now';
  return states.every((st) => st === 'done') ? 'done' : 'upcoming';
}
