import { z } from 'zod';
import { GOAL, goal } from './goal-label.ts';


/** The AIP form's three appropriation sections, in printed order. */
export const PAP_CLASSES = [
  { value: 'GAS', label: 'General Administrative Services' },
  { value: 'STO', label: 'Support to Operations' },
  { value: 'OPERATIONS', label: 'Operations' },
] as const;

export type PapClass = (typeof PAP_CLASSES)[number]['value'];

/**
 * The same three sections as `PAP_CLASSES`, headed the way the printed AIP form
 * heads them.
 *
 * Kept separate rather than replacing the labels above: `PAP_CLASSES` wording is
 * what the create/edit form's dropdown needs ("General Administrative
 * Services"), while a registry that is meant to read like the workbook needs the
 * workbook's own headings. Mirrors `BASIC_SECTIONS` in
 * `api/src/aip-registry/aip-registry-export.service.ts` — if the export's
 * headings or their order change, change them here too.
 *
 * These three values are also **AIP code segment 5** (GAS `001`, STO `002`,
 * Operations `003`), and the program ordinal restarts inside each one — so the
 * order here is the order codes ascend in, not just a display choice. The city's
 * book has a fourth bucket, `004`, for component programs; we never generate it.
 * See `api/docs/aip-reference.md` §7.
 */
export const AIP_SECTIONS = [
  { papClass: 'GAS', label: 'I. GENERAL ADMINISTRATIVE SERVICES' },
  { papClass: 'STO', label: 'II. SUPPORT TO OPERATIONS' },
  { papClass: 'OPERATIONS', label: 'III. OPERATIONS' },
] as const satisfies readonly { papClass: PapClass; label: string }[];

/**
 * Where a PPA's money comes from. Multi-select when the row is declared as one
 * total; a row can instead split its money per fund (`FundSplitEditor`).
 */
export const FUND_SOURCES = [
  { value: 'GF', label: 'GF', description: 'General Fund' },
  { value: 'SEF', label: 'SEF', description: 'Special Education Fund' },
  { value: 'LDF', label: 'LDF', description: 'Local Development Fund' },
  { value: 'LDRRMF', label: 'LDRRMF', description: 'Local Disaster Risk Reduction and Management Fund' },
  { value: 'SPA', label: 'SPA', description: 'Special Purpose Appropriation' },
  { value: 'PPP', label: 'PPP', description: 'Public-Private Partnership' },
  { value: 'NGA', label: 'NGA', description: 'National Government Agency' },
  { value: 'DONATIONS_GRANTS', label: 'Donations / Grants', description: 'Donations and grants' },
  { value: 'GAD', label: 'GAD', description: 'Gender and Development' },
  { value: 'TRUST_FUND', label: 'Trust Fund', description: 'Trust Fund' },
  { value: 'SHF', label: 'SHF', description: 'Special Health Fund' },
  { value: 'EDF', label: 'EDF', description: 'Economic Development Fund' },
  { value: 'CCN', label: 'CCN', description: 'Local college fund' },
  { value: 'JOINT_VENTURE', label: 'Joint Venture', description: 'Joint venture with a private partner' },
  { value: 'BORROWINGS', label: 'Borrowings', description: 'Loan proceeds and other borrowings' },
] as const;

export type FundSource = (typeof FUND_SOURCES)[number]['value'];

/**
 * Funds with special provisions (specs/016): a row charged to one is badged on
 * the public pages, which link to the fund's own page. Mirrors the API's
 * `SPECIAL_FUNDS` (aip-cycles/special-funds.service.ts).
 */
export const SPECIAL_FUNDS: readonly string[] = ['SPA', 'LDF', 'LDRRMF'];

const FUND_SOURCE_VALUES = FUND_SOURCES.map((f) => f.value) as [
  FundSource,
  ...FundSource[],
];

/**
 * Display label for a stored value. Both accept the raw enum key and tolerate
 * null/unknown, because programs and PAs created before these fields existed
 * carry none — every read site would otherwise need the same guard.
 */
export function papClassLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PAP_CLASSES.find((c) => c.value === value)?.label ?? value;
}

export function fundSourceLabel(value: string): string {
  return FUND_SOURCES.find((f) => f.value === value)?.label ?? value;
}

/**
 * Validation schema for new program creation
 * Enforces required fields, character limits, and business logic rules
 */
const estimateAmount = (label: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? '0' : value),
    z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/, `${label} must be a valid amount`)
      .optional(),
  );

/** One line of a row's per-fund split, as the form edits it. */
export interface FundAllocationLine {
  fundSource: FundSource | '';
  ps: string;
  mooe: string;
  fe: string;
  co: string;
}

const fundAllocationLines = z
  .array(
    z.object({
      fundSource: z.union([z.enum(FUND_SOURCE_VALUES), z.literal('')]),
      ps: estimateAmount('PS'),
      mooe: estimateAmount('MOOE'),
      fe: estimateAmount('FE'),
      co: estimateAmount('CO'),
    }),
  )
  .default([]);

/** Form lines → the wire shape. Validation has already required every fund. */
export function toFundAllocations(
  lines: { fundSource: string; ps?: string; mooe?: string; fe?: string; co?: string }[],
): { fundSource: FundSource; ps: string; mooe: string; fe: string; co: string }[] {
  return lines.map((l) => ({
    fundSource: l.fundSource as FundSource,
    ps: l.ps || '0.00',
    mooe: l.mooe || '0.00',
    fe: l.fe || '0.00',
    co: l.co || '0.00',
  }));
}

/**
 * The rules a per-fund split must meet, shared by the program and PPA forms:
 * every line names a fund, no fund twice, at least two funds (one fund is
 * just a total), and some money somewhere.
 */
export function fundSplitIssue(
  lines: { fundSource: string; ps?: string; mooe?: string; fe?: string; co?: string }[],
): string | null {
  if (lines.length < 2) return 'Add at least two funds, or turn the split off';
  if (lines.some((l) => !l.fundSource)) return 'Choose a fund for every line';
  if (new Set(lines.map((l) => l.fundSource)).size !== lines.length)
    return 'Each fund can appear once';
  const anyAmount = lines.some((l) =>
    [l.ps, l.mooe, l.fe, l.co].some((v) => typeof v === 'string' && /[1-9]/.test(v)),
  );
  return anyAmount ? null : 'Enter an amount for at least one fund';
}

export const newProgramSchema = z.object({
  departmentId: z.string()
    .min(1, 'Department is required')
    .describe('Implementing office / department'),

  papClass: z.enum(['GAS', 'STO', 'OPERATIONS'], {
    error: 'Classification is required',
  }).describe('AIP form section — GAS / STO / Operations'),

  sectorId: z.string()
    .min(1, 'Sector is required')
    .describe('Strategic sector classification'),

  programName: z.string()
    .min(1, 'Program name is required')
    .min(5, 'Program name must be at least 5 characters')
    .max(255, 'Program name must be less than 255 characters')
    .describe('Official program name'),

  additionalDescription: z.string()
    .max(1000, 'Additional description must be less than 1000 characters')
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe('Supplementary program description'),

  primaryClusterId: z.string()
    .min(1, `Primary ${goal} / cluster is required`)
    .describe(`Pangunahing ${GOAL} (8 Clusters)`),

  subFinishLineId: z.string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe(`Sub-${goal} (optional)`),

  sdgGoalIds: z.array(z.string()).default([])
    .describe('Sustainable Development Goals (optional multi-tag)'),

  sglgIndicatorId: z.string()
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe('SGLG indicator (optional dual-tag)'),

  // Optional: the MFO statement is often not settled when a program is first
  // drafted, and blocking the save on it just pushed people to type filler.
  expectedOutput: z.string()
    .max(2000, 'Expected output must be less than 2000 characters')
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe('Major Final Output (MFO) - measurable outcome (optional)'),

  targetForBudgetYear: z.string()
    .max(2000, 'Target must be less than 2000 characters')
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe('Target for the budget year, printed on LBP Form 4 (optional)'),

  remarks: z.string()
    .max(1000, 'Remarks must be less than 1000 characters')
    .optional()
    .transform((value) => (value === '' ? undefined : value))
    .describe('Optional justification and explanation'),

  implementationStartMonth: z.number({ error: 'Start month is required' })
    .int().min(1).max(12),
  implementationStartYear: z.number({ error: 'Start year is required' })
    .int().min(2000).max(2100),
  implementationEndMonth: z.number({ error: 'End month is required' })
    .int().min(1).max(12),
  implementationEndYear: z.number({ error: 'End year is required' })
    .int().min(2000).max(2100),

  supportingOfficeIds: z.array(z.string()).max(5).default([]),

  /**
   * Whether the program prints inside another office's AB sheet, under that
   * sheet's COMPONENT PROGRAMS band. UI-only: the wire carries `hostOfficeId`
   * alone, and an unchecked box sends nothing.
   */
  isComponentProgram: z.boolean().default(false),
  hostOfficeId: z.string().optional().transform((value) => (value === '' ? undefined : value)),
  /**
   * Whether this program states its own costs instead of deriving them from its
   * project/activities. UI-only, exactly like `isComponentProgram`: the wire
   * carries `costMode` and the three figures.
   */
  hasOwnCosts: z.boolean().default(false),
  psProposedTotal: estimateAmount('Personnel Services'),
  mooeProposedTotal: estimateAmount('MOOE'),
  feProposedTotal: estimateAmount('Financial Expenses'),
  coProposedTotal: estimateAmount('Capital Outlay'),
  fundSources: z.array(z.string()).default([]),
  /** UI-only: whether the own costs are entered per fund (`fundAllocations`). */
  splitByFund: z.boolean().default(false),
  fundAllocations: fundAllocationLines,
}).superRefine((data, ctx) => {
  const startKey = data.implementationStartYear * 12 + data.implementationStartMonth;
  const endKey = data.implementationEndYear * 12 + data.implementationEndMonth;
  if (startKey > endKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start period must be before or equal to end period',
      path: ['implementationStartMonth'],
    });
  }
  if (data.isComponentProgram && !data.hostOfficeId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Choose the office whose sheet this program appears under',
      path: ['hostOfficeId'],
    });
  }
  if (data.hasOwnCosts && data.splitByFund) {
    const issue = fundSplitIssue(data.fundAllocations);
    if (issue)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['fundAllocations'] });
  } else if (data.hasOwnCosts) {
    // A string test, not a numeric one: money never goes through Number in this
    // codebase. Same rule the PA-level schema applies to its three estimates.
    const statesAnAmount = [
      data.psProposedTotal,
      data.mooeProposedTotal,
      data.feProposedTotal,
      data.coProposedTotal,
    ].some((amount) => typeof amount === 'string' && /[1-9]/.test(amount));
    if (!statesAnAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter at least one amount when the program states its own costs',
        path: ['mooeProposedTotal'],
      });
    }
    if (data.fundSources.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one funding source',
        path: ['fundSources'],
      });
    }
  }
});

export type NewProgramFormData = z.infer<typeof newProgramSchema>;

export interface NewProgramFormValues {
  departmentId: string;
  papClass: PapClass | '';
  sectorId: string;
  programName: string;
  additionalDescription?: string;
  primaryClusterId: string;
  subFinishLineId?: string;
  sdgGoalIds: string[];
  sglgIndicatorId?: string;
  expectedOutput?: string;
  targetForBudgetYear?: string;
  remarks?: string;
  implementationStartMonth: number;
  implementationStartYear: number;
  implementationEndMonth: number;
  implementationEndYear: number;
  supportingOfficeIds: string[];
  isComponentProgram: boolean;
  hostOfficeId?: string;
  hasOwnCosts: boolean;
  psProposedTotal?: string;
  mooeProposedTotal?: string;
  feProposedTotal?: string;
  coProposedTotal?: string;
  fundSources: string[];
  splitByFund: boolean;
  fundAllocations: FundAllocationLine[];
}

/**
 * Mock data types for dropdown options

 * In production, these would come from API responses
 */
export interface Department {
  id: string;
  name: string;
  code: string;
  officeType: string;
}

export interface Sector {
  id: string;
  name: string;
  code: string;
}

export interface Cluster {
  id: string;
  name: string;
  code: string;
  isPrimary?: boolean;
}

export interface AIPCode {
  code: string;
  format: string;
}

/**
 * Dropdown option shapes returned by the real API (via server actions).
 * `code` is the display code: office acronym for departments, PAP code for sectors.
 */
export interface ReferenceOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Extended reference option for implementing offices.
 * Carries the office's own PAP sector code so the form can auto-select the
 * sector field. Undefined for the few offices with no sector set.
 */
export interface DepartmentOption extends ReferenceOption {
  defaultSectorCode?: string;
  /** Strategic cluster the office belongs to — groups the office pickers. */
  clusterName?: string;
}

export interface SubFinishLineOption {
  id: string;
  code: string;
  name: string;
}

export interface FinishLineOption {
  id: string;
  name: string;
  fullName: string;
  visionNumber: number | null;
  subFinishLines: SubFinishLineOption[];
}

export interface SglgIndicatorOption {
  id: string;
  code: string;
  name: string;
  pillar: string;
}

export interface SdgGoalOption {
  id: string;
  code: string;
  name: string;
}

export interface NewProgramReference {
  /** City offices for the implementing-office picker. */
  departments: DepartmentOption[];
  /** All city offices — always loaded for the supporting-office picker. */
  offices: ReferenceOption[];
  /** The user's own org ID (officeId for LGU, civilSocietyOrganizationId for NCPC). */
  ownOrgId: string | null;
  sectors: ReferenceOption[];
  finishLines: FinishLineOption[];
  sglgIndicators: SglgIndicatorOption[];
  sdgGoals: SdgGoalOption[];
  cycle: { id: string; fiscalYear: number } | null;
}

export interface Program {
  id: string;
  aipReferenceCode: string;
  departmentId: string;
  sectorId: string;
  programName: string;
  additionalDescription?: string;
  primaryClusterId: string;
  secondaryClusterId?: string;
  expectedOutput?: string;
  remarks?: string;
  status: 'draft' | 'pending' | 'submitted';
  implementationStartMonth?: number;
  implementationStartYear?: number;
  implementationEndMonth?: number;
  implementationEndYear?: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Line item schema for project/activity budget entries
 */
export const lineItemSchema = z.object({
  id: z.string().uuid().optional(),
  expenseClass: z.enum(['PS', 'MOOE', 'FE', 'CO']),
  uacsObjectId: z.string().min(1, 'UACS object is required'),
  quantity: z.number().min(1, 'Quantity must be at least 1'),
  unit: z.string().min(1, 'Unit is required'),
  unitCost: z.number().min(0.01, 'Unit cost must be greater than ₱0'),
  remarks: z.string().max(500, 'Remarks must be less than 500 characters').optional(),
});

export type LineItemFormData = z.infer<typeof lineItemSchema>;

export interface LineItem extends LineItemFormData {
  id: string;
  lineTotal: number; // quantity * unitCost
}

/**
 * Cost mode for projects: DIRECT_COSTS or ACTIVITY_CHILDREN
 */
export type ProjectCostMode = 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';

/**
 * A PS/MOOE/FE/CO amount, where an empty box means zero.
 *
 * Each class is individually optional — only the *sum* has to be non-zero — so a
 * blank is "nothing budgeted under this class", not a typo. It must be zeroed
 * before the regex runs: `''` is still a string, so `.optional()` does not
 * exempt it and the field would report "must be a valid amount" on a box the
 * user deliberately left empty.
 */

export function makeAddProjectActivitySchema(requirePeriod: boolean) {
  return z.object({
    entryType: z.enum(['project', 'activity']),
    aipReferenceCode: z.string().min(1),
    projectActivityName: z.string()
      .min(1, 'Project/Activity name is required')
      .min(5, 'Name must be at least 5 characters')
      .max(255, 'Name must be less than 255 characters'),

    additionalDescription: z.string()
      .max(1000, 'Additional description must be less than 1000 characters')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),

    expectedOutput: z.string()
      .max(2000, 'Expected output must be less than 2000 characters')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),

    proposedBudget: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string()
        .regex(/^\d+(\.\d{1,2})?$/, 'Proposed budget must be a valid amount')
        .optional(),
    ),

    // Required, except for an ACTIVITY_CHILDREN parent — see the superRefine
    // below. Its funds are unioned server-side from its child activities, so the
    // form does not ask for them.
    // Every fund the API accepts — the list once stopped at TRUST_FUND, so an
    // imported SHF row could not be saved.
    fundSources: z.array(z.enum(FUND_SOURCE_VALUES)),
    /** UI-only: whether the costs are entered per fund (`fundAllocations`). */
    splitByFund: z.boolean().default(false),
    fundAllocations: fundAllocationLines,

    // Phase 1 cost estimates (D3). proposedBudget is server-computed from these,
    // so the form shows it read-only and never submits it alongside them.
    psEstimate: estimateAmount('PS estimate'),
    mooeEstimate: estimateAmount('MOOE estimate'),
    feEstimate: estimateAmount('FE estimate'),
    coEstimate: estimateAmount('CO estimate'),

    remarks: z.string()
      .max(1000, 'Remarks must be less than 1000 characters')
      .optional()
      .transform((value) => (value === '' ? undefined : value)),

    implementationStartMonth: z.number().int().min(1).max(12).optional(),
    implementationStartYear: z.number().int().min(2000).max(2100).optional(),
    implementationEndMonth: z.number().int().min(1).max(12).optional(),
    implementationEndYear: z.number().int().min(2000).max(2100).optional(),

    costMode: z.enum(['DIRECT_COSTS', 'ACTIVITY_CHILDREN']).default('DIRECT_COSTS'),

    lineItems: z.array(lineItemSchema),

    hasClimateTag: z.boolean().default(false),
    ccetCodeIds: z.array(z.string()).default([]),
    ccaAmount: z.number().min(0).optional(),
    ccmAmount: z.number().min(0).optional(),
    ccRemarks: z.string().max(1000).optional(),
  }).superRefine((data, ctx) => {
    // Phase 1 §4.4: at least one non-zero expense class. This is *form*
    // validation, not the publish gate — the publish gate is proposedBudget > 0,
    // so legacy rows imported without a class breakdown stay publishable (D19).
    // ACTIVITY_CHILDREN parents are exempt: their estimates are summed from
    // children and are read-only here.
    if (data.costMode !== 'ACTIVITY_CHILDREN' && data.splitByFund) {
      const issue = fundSplitIssue(data.fundAllocations);
      if (issue)
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: issue, path: ['fundAllocations'] });
    } else if (data.costMode !== 'ACTIVITY_CHILDREN') {
      // String test rather than summing: this only asks "did they enter a
      // non-zero amount anywhere", and money must never round-trip through
      // Number (it is Decimal(18,2) on the wire).
      const hasAmount = [data.psEstimate, data.mooeEstimate, data.feEstimate, data.coEstimate]
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
        .some((v) => /[1-9]/.test(v));
      if (!hasAmount) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Enter an amount for at least one expense class',
          path: ['mooeEstimate'],
        });
      }

      // Same exemption as the estimates: an ACTIVITY_CHILDREN parent's funds are
      // unioned from its children, and the field is not rendered for it.
      if (data.fundSources.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Select at least one source of funds',
          path: ['fundSources'],
        });
      }
    }

    if (data.hasClimateTag && data.ccetCodeIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select at least one CCET typology code when climate change tagging is enabled',
        path: ['ccetCodeIds'],
      });
    }

    if (requirePeriod) {
      if (data.implementationStartMonth == null || data.implementationStartYear == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Implementation start is required',
          path: ['implementationStartMonth'],
        });
      }
      if (data.implementationEndMonth == null || data.implementationEndYear == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Implementation end is required',
          path: ['implementationEndMonth'],
        });
      }
    }

    if (
      data.implementationStartYear != null && data.implementationStartMonth != null &&
      data.implementationEndYear != null && data.implementationEndMonth != null
    ) {
      const startValue = data.implementationStartYear * 12 + data.implementationStartMonth;
      const endValue = data.implementationEndYear * 12 + data.implementationEndMonth;
      if (startValue > endValue) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Start period must be before or equal to end period', path: ['implementationStartMonth'] });
      }
    }
  });
}

export const addProjectActivitySchema = makeAddProjectActivitySchema(false);

export type AddProjectActivityFormData = z.infer<typeof addProjectActivitySchema>;

export interface AddProjectActivityFormValues {
  entryType: 'project' | 'activity';
  aipReferenceCode: string;
  projectActivityName: string;
  additionalDescription?: string;
  expectedOutput?: string;
  proposedBudget?: string;
  fundSources: FundSource[];
  splitByFund: boolean;
  fundAllocations: FundAllocationLine[];
  psEstimate?: string;
  mooeEstimate?: string;
  feEstimate?: string;
  coEstimate?: string;
  remarks?: string;
  implementationStartMonth?: number;
  implementationStartYear?: number;
  implementationEndMonth?: number;
  implementationEndYear?: number;
  costMode: ProjectCostMode;
  lineItems: LineItemFormData[];
  hasClimateTag: boolean;
  ccetCodeIds: string[];
  ccaAmount?: number;
  ccmAmount?: number;
  ccRemarks?: string;
}

/**
 * Program with budget context (returned from API)

 */
export interface ProgramWithBudget extends Program {
  primaryFinishLineName: string;
  budgetCeiling: number;
  children: ProjectActivityItem[];
  totalProjectActivityCost: number;
  remainingBudget: number;
  utilizationPercent: number;
}

export interface ProjectActivityItem {
  id: string;
  ppaType: 'project' | 'activity';
  name: string;
  totalCost: number;
  status: 'draft' | 'pending' | 'submitted';
}

// ─── PPMP ───────────────────────────────────────────────────────────────────
// Standalone from Program/ProjectActivity/LineItem — see
// specs/001-ppmp-creation/research.md Decision 5. Fixed, closed dropdown sets
// per spec Assumptions (no admin-managed taxonomy).

export const PPMP_PROJECT_TYPES = [
  { value: 'GOODS', label: 'Goods' },
  { value: 'SERVICES', label: 'Services' },
  { value: 'CONSULTING_SERVICES', label: 'Consulting Services' },
  { value: 'INFRASTRUCTURE_PROJECTS', label: 'Infrastructure Projects' },
] as const;

export type PpmpProjectType = (typeof PPMP_PROJECT_TYPES)[number]['value'];

export const PPMP_PROCUREMENT_MODES = [
  { value: 'SMALL_VALUE_PROCUREMENT', label: 'Small Value Procurement' },
  { value: 'COMPETITIVE_BIDDING', label: 'Competitive Bidding' },
  { value: 'NEGOTIATED_PROCUREMENT', label: 'Negotiated Procurement' },
  { value: 'HIGHLY_TECHNICAL_CONSULTANTS', label: 'Highly Technical Consultants' },
] as const;

export type PpmpProcurementMode = (typeof PPMP_PROCUREMENT_MODES)[number]['value'];

/**
 * A Project's own categorization — modeled on `PAP_CLASSES`' first three
 * labels (General Administrative Services / Support to Operations /
 * Operations) but a separate set, not a reuse: Digitalization has no AIP
 * code segment and this never feeds the AIP code format the way `papClass`
 * does on a Program.
 */
export const PPMP_CLASSIFICATIONS = [
  { value: 'GENERAL_ADMINISTRATIVE_SERVICES', label: 'General Administrative Services' },
  { value: 'SUPPORT_TO_OPERATIONS', label: 'Support to Operations' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'DIGITALIZATION', label: 'Digitalization' },
] as const;

export type PpmpClassification = (typeof PPMP_CLASSIFICATIONS)[number]['value'];

export function ppmpClassificationLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return PPMP_CLASSIFICATIONS.find((c) => c.value === value)?.label ?? value;
}

// aipCycleId is intentionally absent: the create form never asks for it — the
// open AIP cycle is resolved server-side in the action, the same way
// `submitNewProgram` resolves it for a Program (see app/ppmp/new/_actions.ts).
export const ppmpSchema = z.object({
  officeId: z.string().min(1, 'Office is required'),
  classification: z.enum(
    ['GENERAL_ADMINISTRATIVE_SERVICES', 'SUPPORT_TO_OPERATIONS', 'OPERATIONS', 'DIGITALIZATION'],
    { error: 'Classification is required' },
  ),
  name: z.string().min(1, 'Project name is required'),
  // Free text, not a Program picker (reverses specs/005 research.md
  // Decision 2 — see PPMP.fundingProgram's schema comment).
  fundingProgram: z.string().min(1, 'A funding AIP Program is required'),
});

export type PpmpFormValues = z.infer<typeof ppmpSchema>;

const DECIMAL_STRING = /^\d+(\.\d{1,2})?$/;

export const ppmpLineItemSchema = z.object({
  lineItemName: z.string().min(1, 'Line item name is required').max(255, 'Line item name must be less than 255 characters'),
  // Optional — offices don't always have these decided when they first log
  // the line item.
  typeOfProject: z.enum([
    'GOODS',
    'SERVICES',
    'CONSULTING_SERVICES',
    'INFRASTRUCTURE_PROJECTS',
  ]).optional(),
  modeOfProcurement: z.enum([
    'SMALL_VALUE_PROCUREMENT',
    'COMPETITIVE_BIDDING',
    'NEGOTIATED_PROCUREMENT',
    'HIGHLY_TECHNICAL_CONSULTANTS',
  ]).optional(),
  uacsObjectId: z.string().min(1, 'UACS object is required'),
  quantity: z.string().regex(DECIMAL_STRING, 'Quantity must be a valid amount'),
  unit: z.string().min(1, 'Unit is required'),
  unitCost: z.string().regex(DECIMAL_STRING, 'Unit cost must be a valid amount'),
  fundSource: z.enum([
    'GF', 'SEF', 'LDF', 'LDRRMF', 'SPA', 'PPP', 'NGA', 'DONATIONS_GRANTS', 'GAD',
    'TRUST_FUND', 'SHF', 'EDF', 'CCN', 'JOINT_VENTURE', 'BORROWINGS',
  ]),
  expenseClass: z.enum(['PS', 'MOOE', 'FE', 'CO']),
  preProcurementConferenceRequired: z.boolean(),
  procurementStartMonth: z.number({ error: 'Start month is required' }).int().min(1).max(12),
  procurementStartYear: z.number({ error: 'Start year is required' }).int().min(2000).max(2100),
  procurementEndMonth: z.number({ error: 'End month is required' }).int().min(1).max(12),
  procurementEndYear: z.number({ error: 'End year is required' }).int().min(2000).max(2100),
  // Free text, one field — not a structured month/year picker, and not a
  // start/end pair. Offices write things like "within 30 days of PO" that
  // don't split into two dates.
  deliveryPeriod: z.string().max(200, 'Must be less than 200 characters').optional(),
  remarks: z.string().max(500, 'Remarks must be less than 500 characters').optional(),
}).superRefine((data, ctx) => {
  const procurementStartKey = data.procurementStartYear * 12 + data.procurementStartMonth;
  const procurementEndKey = data.procurementEndYear * 12 + data.procurementEndMonth;
  if (procurementStartKey > procurementEndKey) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Start of Procurement Activity must be before or equal to End of Procurement Activity',
      path: ['procurementStartMonth'],
    });
  }
});

export type PpmpLineItemFormValues = z.infer<typeof ppmpLineItemSchema>;

/** Start of Jan-2027 – Dec-2027, per the GPPB-aligned form's stated default. */
export const PPMP_DEFAULT_PERIOD = {
  startMonth: 1,
  startYear: 2027,
  endMonth: 12,
  endYear: 2027,
} as const;
