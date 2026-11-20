'use client';

import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronUp, Info, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { addDecimalStrings, formatPeso } from '@/lib/currency-formatter';
import ProgramIdentitySection from './program-identity-section';
import StrategicAlignmentSection from '@/components/finish-lines/strategic-alignment-section';
import { ProgramCostSection } from '@/components/program/program-cost-section';
import {
  newProgramSchema,
  NewProgramFormValues,
  ReferenceOption,
  DepartmentOption,
  FinishLineOption,
  SdgGoalOption,
  SglgIndicatorOption,
  type PapClass,
  toFundAllocations,
} from '@/lib/schemas';
import {
  loadNewProgramReference,
  previewProgramAipCode,
  submitNewProgram,
} from '@/app/programs/new/_actions';
import { updateProgramAction } from '@/app/programs/[id]/_actions';
import { ProgramThematicTagSection } from '@/components/program/program-thematic-tag-section';
import { ProgramClimateTagCard } from '@/components/program/program-climate-tag-card';
import { GOALS, goal, goals } from '@/lib/goal-label';


interface NewProgramFormProps {
  onNavigateToRegistry?: () => void;
  onNavigateToProject?: (programId: string) => void;
  /** Fires unconditionally right after a successful save — distinct from
   * `onNavigateToProject`, which only fires if the user clicks the toast's
   * "Add Project" action. The drawer host uses this one to close itself and
   * refresh the registry row regardless of what the user does with the toast. */
  onSaved?: (programId: string) => void;
  /** Renders the New Program drawer's chrome (eyebrow/title/close, progress
   * bar, section tabs, flat numbered sections, contextual footer) instead of
   * the full-page header/progress-card/accordion layout — avoids the drawer
   * carrying two headers, and is also the switch for the drawer's own visual
   * design (see specs discussion: "Redesign the New Program drawer"). */
  embedded?: boolean;
  /** The existing program, in the same shape `/api/programs/:id` returns —
   * drives both the form's defaults and, once `currentVersion > 0`, which
   * fields are locked. Only read when `editMode` is set. */
  initialData?: Record<string, unknown> | null;
  /** Switches submission from create to update-in-place, and the embedded
   * chrome from "New program" to "Edit program" — the in-place counterpart
   * of the retired `/programs/:id/edit` page (FR-012), hosted inside
   * `ProgramOverviewDrawer` instead of `NewProgramDrawer`. */
  editMode?: boolean;
  /** Set to the form's guarded close, so a host Sheet's Escape / outside-press
   * dismissal asks about unsaved changes like the × and Cancel buttons do. */
  closeRequestRef?: RefObject<(() => void) | null>;
  /** Peek-navigation: steps the host's drawer to the next/previous row in the
   * registry table without closing the form. Edit-mode only — "New program"
   * has no row to step to. */
  onNavigate?: (direction: 1 | -1) => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

/** Scroll-spy anchors for the embedded drawer's section tabs, in order. */
const BASE_SECTION_IDS = ['sec-identity', 'sec-office', 'sec-align', 'sec-outputs'] as const;
const EDIT_ONLY_SECTION_IDS = ['sec-tags', 'sec-climate-tagging'] as const;

/**
 * Main form component for creating new programs
 * Orchestrates sections, validation, and submission
 */
export default function NewProgramForm({
  onNavigateToRegistry,
  onNavigateToProject,
  onSaved,
  embedded = false,
  initialData,
  editMode = false,
  closeRequestRef,
  onNavigate,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Readonly<NewProgramFormProps>) {
  const router = useRouter();

  // Build form defaults from the existing program when editing. Mirrors the
  // retired `ProgramForm`'s mapping, including the nested-id fallbacks a raw
  // API response needs (`{ office: { id } }` vs. a bare id string already
  // flattened by a caller handing its own submit payload back).
  const init = (initialData ?? {}) as Record<string, unknown>;
  const getNestedId = (obj: Record<string, unknown>, key: string): string | undefined => {
    const val = obj[key];
    if (typeof val === 'object' && val !== null && 'id' in (val as Record<string, unknown>)) {
      const id = (val as Record<string, unknown>)['id'];
      return typeof id === 'string' ? id : undefined;
    }
    return undefined;
  };
  // papSectorId, papSubsectorCode, and finishLineId are locked once the
  // program has been submitted at least once (currentVersion > 0): they feed
  // into the AIP reference code and the budget ceiling pool allocation.
  const locked = editMode && ((init['currentVersion'] as number) ?? 0) > 0;
  // A program with PPAs cannot also state its own costs (mutually exclusive;
  // the server rejects the combination), so the option is disabled rather
  // than offered.
  const hasProjectActivities = ((init['projectActivities'] as unknown[] | undefined)?.length ?? 0) > 0;
  const supportingFromInit = (() => {
    const raw = init['supportingOffices'] ?? init['supportingOfficeIds'];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          if (obj.office && typeof obj.office === 'object') {
            const id = (obj.office as Record<string, unknown>).id;
            return typeof id === 'string' ? id : '';
          }
          return typeof obj.id === 'string' ? obj.id : '';
        }
        return '';
      })
      .filter((s): s is string => s.length > 0);
  })();
  const sdgFromInit = (() => {
    const raw = init['sdgGoals'] ?? init['sdgGoalIds'];
    if (!Array.isArray(raw)) return [];
    return raw
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const obj = entry as Record<string, unknown>;
          if (obj.sdgGoal && typeof obj.sdgGoal === 'object') {
            const id = (obj.sdgGoal as Record<string, unknown>).id;
            return typeof id === 'string' ? id : '';
          }
          return typeof obj.id === 'string' ? obj.id : '';
        }
        return '';
      })
      .filter((s): s is string => s.length > 0);
  })();
  const editDefaultValues = {
    departmentId: (init['department_id'] ?? init['departmentId'] ?? init['office_id'] ?? init['officeId'] ?? '') as string || '',
    papClass: (init['pap_class'] ?? init['papClass'] ?? '') as PapClass | '',
    sectorId: (init['pap_sector_id'] ?? init['papSectorId'] ?? init['sector_id'] ?? init['sectorId'] ?? getNestedId(init, 'papSector') ?? '') as string || '',
    programName: (init['program_name'] ?? init['programName'] ?? init['ppa_description'] ?? init['name'] ?? '') as string || '',
    additionalDescription: (init['additional_description'] ?? init['additionalDescription'] ?? init['description'] ?? '') as string || '',
    primaryClusterId: (init['primary_finish_line_id'] ?? init['primaryClusterId'] ?? init['finishLineId'] ?? init['finish_line_id'] ?? getNestedId(init, 'finishLine') ?? '') as string || '',
    subFinishLineId: (init['subFinishLineId'] ?? init['sub_finish_line_id'] ?? getNestedId(init, 'subFinishLine') ?? '') as string || '',
    sglgIndicatorId: (init['sglg_indicator_id'] ?? init['sglgIndicatorId'] ?? getNestedId(init, 'sglgIndicator') ?? '') as string || '',
    expectedOutput: (init['expected_output_mfo'] ?? init['expectedOutput'] ?? '') as string || '',
    targetForBudgetYear: (init['targetForBudgetYear'] ?? '') as string || '',
    remarks: (init['remarks'] ?? init['notes'] ?? '') as string || '',
    implementationStartMonth: (init['implementationStartMonth'] ?? init['implementation_start_month'] ?? undefined) as number | undefined,
    implementationStartYear: (init['implementationStartYear'] ?? init['implementation_start_year'] ?? undefined) as number | undefined,
    implementationEndMonth: (init['implementationEndMonth'] ?? init['implementation_end_month'] ?? undefined) as number | undefined,
    implementationEndYear: (init['implementationEndYear'] ?? init['implementation_end_year'] ?? undefined) as number | undefined,
    supportingOfficeIds: supportingFromInit,
    sdgGoalIds: sdgFromInit,
    hostOfficeId: (init['host_office_id'] ?? init['hostOfficeId'] ?? getNestedId(init, 'hostOffice') ?? '') as string || '',
    isComponentProgram: Boolean(init['host_office_id'] ?? init['hostOfficeId'] ?? getNestedId(init, 'hostOffice')),
    hasOwnCosts: (init['costMode'] ?? init['cost_mode']) === 'DIRECT_COSTS',
    psProposedTotal: (init['psProposedTotal'] ?? init['ps_proposed_total'] ?? '') as string,
    mooeProposedTotal: (init['mooeProposedTotal'] ?? init['mooe_proposed_total'] ?? '') as string,
    feProposedTotal: (init['feProposedTotal'] ?? init['fe_proposed_total'] ?? '') as string,
    coProposedTotal: (init['coProposedTotal'] ?? init['co_proposed_total'] ?? '') as string,
    fundSources: (init['fundSources'] ?? init['fund_sources'] ?? []) as string[],
    fundAllocations: (init['fundAllocations'] ?? []) as NewProgramFormValues['fundAllocations'],
    splitByFund: ((init['fundAllocations'] ?? []) as unknown[]).length > 0,
  } as unknown as NewProgramFormValues;

  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [offices, setOffices] = useState<ReferenceOption[]>([]);
  const [ownOrgId, setOwnOrgId] = useState<string | null>(null);
  const [sectors, setSectors] = useState<ReferenceOption[]>([]);
  const [clusters, setClusters] = useState<FinishLineOption[]>([]);
  const [sglgIndicators, setSglgIndicators] = useState<SglgIndicatorOption[]>([]);
  const [sdgGoals, setSdgGoals] = useState<SdgGoalOption[]>([]);
  const [fiscalYear, setFiscalYear] = useState<number | null>(null);
  const [referenceError, setReferenceError] = useState<string>();
  const [aipCode, setAipCode] = useState<string | undefined>(
    editMode ? ((init['aipReferenceCode'] as string | undefined) ?? (init['tentativeAipReferenceCode'] as string | undefined)) : undefined,
  );
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [codeGenerationError, setCodeGenerationError] = useState<string>();
  const [departmentsLoading, setDepartmentsLoading] = useState(true);
  const [sectorsLoading, setSectorsLoading] = useState(true);
  const [clustersLoading, setClustersLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [expandedSections, setExpandedSections] = useState<string[]>(['identity', 'alignment']);
  const [invalidFieldCount, setInvalidFieldCount] = useState(0);
  const [showRecoveredBanner, setShowRecoveredBanner] = useState(false);
  const [manuallyDismissedBanner, setManuallyDismissedBanner] = useState(false);
  const [showWhatHappensNext, setShowWhatHappensNext] = useState(false);

  // Embedded (drawer) only: which section tab is active, and the scroll
  // container the tabs scroll-spy against.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);

  // Initialize form
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
    reset,
    getValues,
  } = useForm<NewProgramFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(newProgramSchema) as any,
    defaultValues: editMode
      ? editDefaultValues
      : {
          departmentId: '',
          papClass: '',
          sectorId: '',
          programName: '',
          additionalDescription: '',
          primaryClusterId: '',
          subFinishLineId: '',
          sdgGoalIds: [],
          sglgIndicatorId: '',
          expectedOutput: '',
          remarks: '',
          supportingOfficeIds: [],
          isComponentProgram: false,
          hasOwnCosts: false,
          psProposedTotal: '',
          mooeProposedTotal: '',
          feProposedTotal: '',
          coProposedTotal: '',
          fundSources: [],
          splitByFund: false,
          fundAllocations: [],
          hostOfficeId: '',
        },
  });

  const watchedDepartmentId = useWatch({ control, name: 'departmentId' });
  const watchedSectorId = useWatch({ control, name: 'sectorId' });
  const watchedSupportingOfficeIds = useWatch({ control, name: 'supportingOfficeIds' });
  const watchedProgramName = useWatch({ control, name: 'programName' });
  const watchedAdditionalDescription = useWatch({ control, name: 'additionalDescription' });
  const watchedPrimaryClusterId = useWatch({ control, name: 'primaryClusterId' });
  const watchedPapClass = useWatch({ control, name: 'papClass' });
  const watchedStartMonth = useWatch({ control, name: 'implementationStartMonth' });
  const watchedStartYear = useWatch({ control, name: 'implementationStartYear' });
  const watchedEndMonth = useWatch({ control, name: 'implementationEndMonth' });
  const watchedEndYear = useWatch({ control, name: 'implementationEndYear' });
  const watchedSglgIndicatorId = useWatch({ control, name: 'sglgIndicatorId' });
  const watchedExpectedOutput = useWatch({ control, name: 'expectedOutput' });
  const watchedRemarks = useWatch({ control, name: 'remarks' });
  // Embedded (drawer) only: the own-costs block adds an 8th required field and
  // changes the footer/"what happens" copy.
  const watchedHasOwnCosts = useWatch({ control, name: 'hasOwnCosts' });
  const watchedFundSources = useWatch({ control, name: 'fundSources' });
  const watchedPs = useWatch({ control, name: 'psProposedTotal' });
  const watchedMooe = useWatch({ control, name: 'mooeProposedTotal' });
  const watchedFe = useWatch({ control, name: 'feProposedTotal' });
  const watchedCo = useWatch({ control, name: 'coProposedTotal' });

  // Super-admin path: the caller has no own org, so the multi-select *is* the
  // implementing-office picker. Mirror the first selected office into
  // departmentId so it drives both the AIP code preview and the sector
  // auto-assignment below. (For staff, departmentId is their own org.)
  const isSuperAdmin = !ownOrgId;
  useEffect(() => {
    if (!isSuperAdmin) return;
    // `ownOrgId` starts `null` until the reference-data load resolves, so
    // `isSuperAdmin` reads true by default for every caller — including a
    // staff user — for one tick. In edit mode `departmentId` is already
    // correctly prefilled from the program's own office at that point, and
    // `supportingOfficeIds` (the additional offices only) is still empty, so
    // this would wipe a real prefill out from under a non-super-admin editor
    // before their actual role is known. Wait for that load to finish.
    if (departmentsLoading) return;
    const primary = watchedSupportingOfficeIds?.[0] ?? '';
    setValue('departmentId', primary, { shouldDirty: true });
  }, [isSuperAdmin, watchedSupportingOfficeIds, setValue, departmentsLoading]);

  // Auto-select sector based on implementing office cluster. When a super admin
  // clears the office list, departmentId empties — drop the auto-assigned sector
  // so a stale value can't carry over.
  const prevDeptRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prevDept = prevDeptRef.current;
    prevDeptRef.current = watchedDepartmentId;
    if (!watchedDepartmentId) {
      if (isSuperAdmin) setValue('sectorId', '');
      return;
    }
    if (!departments.length || !sectors.length) return;
    const dept = departments.find((d) => d.id === watchedDepartmentId);
    if (!dept?.defaultSectorCode) {
      // The office has no sector to assign, so whatever is in the field belongs
      // to the *previous* office — an unnoticed wrong AIP code. Wipe it only on
      // a real switch, so a restored draft's manual pick survives `departments`
      // loading in (which re-runs this effect).
      if (prevDept !== undefined && prevDept !== watchedDepartmentId) {
        setValue('sectorId', '');
      }
      return;
    }
    const sector = sectors.find((s) => s.code === dept.defaultSectorCode);
    if (sector) setValue('sectorId', sector.id);
  }, [watchedDepartmentId, departments, sectors, setValue, isSuperAdmin]);

  /**
   * What the progress badge counts — one entry per required key in
   * `newProgramSchema`, so the denominator is `.length` and never a literal. The
   * old hardcoded "of 5" went stale twice over: `papClass` and the
   * implementation period became required and were never counted, while
   * `expectedOutput` kept being counted long after it turned optional.
   *
   * Computed during render, not held in state: it is display-only, and the
   * effect that mirrored it into state could only ever lag the form by a tick.
   */
  const requiredFields = [
    watchedDepartmentId,
    watchedPapClass,
    watchedSectorId,
    watchedProgramName,
    watchedPrimaryClusterId,
    // A period is complete only with both halves — a month alone is not a date.
    watchedStartMonth != null && watchedStartYear != null,
    watchedEndMonth != null && watchedEndYear != null,
  ];
  const completedFieldsCount = requiredFields.filter((value) =>
    typeof value === 'string' ? value.trim() !== '' : value,
  ).length;

  /**
   * The embedded drawer's own progress model: the same 7 fields as above, as
   * plain booleans, plus an 8th ("source of funds") only while the program
   * states its own costs — matching the acceptance criterion "7, or 8 when
   * own costs is on". Index order is load-bearing: `MISSING_LABELS` and the
   * tab-completion grouping below both read it positionally.
   */
  const requiredChecks = [
    !!watchedDepartmentId,
    !!watchedPapClass,
    !!watchedSectorId,
    !!watchedProgramName?.trim(),
    !!watchedPrimaryClusterId,
    watchedStartMonth != null && watchedStartYear != null,
    watchedEndMonth != null && watchedEndYear != null,
    ...(watchedHasOwnCosts ? [!!watchedFundSources?.length] : []),
  ];
  const completedCount = requiredChecks.filter(Boolean).length;
  const allRequiredComplete = completedCount === requiredChecks.length;
  const progressPct = (completedCount / requiredChecks.length) * 100;

  const MISSING_LABELS = [
    'implementing office',
    'classification',
    'sector',
    'program name',
    goal,
    'start month',
    'end month',
    'source of funds',
  ];
  const missingLabels = requiredChecks
    .map((ok, i) => (ok ? null : MISSING_LABELS[i]))
    .filter((m): m is string => !!m);

  // Thematic tags and climate tagging only apply to an existing program
  // (nothing to tag before it's created) and are each saved separately from
  // the form, so they only appear once editing.
  const showTagsAndClimate = editMode;
  const sectionIds = showTagsAndClimate ? [...BASE_SECTION_IDS, ...EDIT_ONLY_SECTION_IDS] : BASE_SECTION_IDS;

  // Which required-field indices belong to each section tab — drives both the
  // tab's ✓ mark and (indirectly, via `missingLabels`) the footer copy. Tags
  // and climate tagging have no required fields of their own (optional,
  // separately-saved sections), so they never pick up a ✓.
  const TAB_FIELD_INDICES: number[][] = [
    [1, 3, 5, 6],
    [0, 2],
    [4],
    watchedHasOwnCosts ? [7] : [],
    ...(showTagsAndClimate ? [[], []] : []),
  ];
  const tabLabels = showTagsAndClimate
    ? ['Identity', 'Office', 'Alignment', 'Outputs & budget', 'Tags', 'Climate']
    : ['Identity', 'Office', 'Alignment', 'Outputs & budget'];
  const tabs = tabLabels.map((label, i) => {
    const idxs = TAB_FIELD_INDICES[i];
    return {
      id: sectionIds[i],
      label,
      complete: idxs.length > 0 && idxs.every((j) => requiredChecks[j]),
    };
  });

  const ownCostsTotal = addDecimalStrings([watchedPs, watchedMooe, watchedFe, watchedCo]);
  const afterSteps = watchedHasOwnCosts
    ? [
        {
          title: 'Saved as a draft',
          body: `The program appears in the AIP Registry under its primary office with a proposed budget of ${formatPeso(ownCostsTotal)}.`,
        },
        {
          title: 'No projects or activities',
          body: 'Because costs are entered on the program itself, it cannot hold projects or activities. Untick the option above if you need them.',
        },
        {
          title: 'Publish when ready',
          body: 'Review the amounts per fund, then publish the program so it shows on the public portal.',
        },
      ]
    : [
        {
          title: 'Saved as a draft',
          body: 'The program appears in the AIP Registry under its primary office. Nothing is public yet.',
        },
        {
          title: 'Add projects and activities',
          body: 'You will be taken straight to adding projects and activities. Costs (PS, MOOE, FE, CO) are entered there.',
        },
        {
          title: 'Totals roll up',
          body: 'The program total is the sum of its projects and activities. Publish when the breakdown is complete.',
        },
      ];

  const footerNextLabel = !allRequiredComplete
    ? `Still needed: ${missingLabels.join(', ')}`
    : watchedHasOwnCosts
      ? 'After saving, this program is ready for review.'
      : 'After saving, you will add projects and activities.';

  const goToSection = (i: number) => {
    const container = scrollRef.current;
    const target = container?.querySelector<HTMLElement>(`#${sectionIds[i]}`);
    if (container && target) {
      container.scrollTo({ top: target.offsetTop - container.offsetTop - 8, behavior: 'smooth' });
    }
    setActiveTab(i);
  };

  const handleBodyScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    let next = 0;
    sectionIds.forEach((id, i) => {
      const target = el.querySelector<HTMLElement>(`#${id}`);
      if (target && target.offsetTop - el.offsetTop - 40 <= el.scrollTop) next = i;
    });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) next = sectionIds.length - 1;
    if (next !== activeTab) setActiveTab(next);
  };

  // Autosave to localStorage (debounced) — save compact draft with validation snapshot and metadata.
  // Create only: the key is a single shared slot ('newProgramDraft'), not
  // keyed by program id, so autosaving an edit would stomp whatever create
  // draft is in progress (or vice versa) and restore the wrong one on reload.
  useEffect(() => {
    if (editMode) return;
    const timer = setTimeout(() => {
      if (isDirty) {
        try {
          // Build compact values (only non-empty)
          const rawValues = {
            departmentId: watchedDepartmentId,
            sectorId: watchedSectorId,
            programName: watchedProgramName,
            additionalDescription: watchedAdditionalDescription,
            primaryClusterId: watchedPrimaryClusterId,
            sglgIndicatorId: watchedSglgIndicatorId,
            expectedOutput: watchedExpectedOutput,
            remarks: watchedRemarks,
          };

          const compactValues: Record<string, string> = {};
          Object.entries(rawValues).forEach(([k, v]) => {
            if (v !== undefined && v !== null && String(v).trim() !== '') compactValues[k] = v;
          });

          // Validation snapshot (short)
          const validationResult = newProgramSchema.safeParse({ ...rawValues });
          const validationSnapshot: Record<string, { status: 'valid' | 'invalid'; message?: string }> = {};
          if (validationResult.success) {
            Object.keys(rawValues).forEach((k) => {
              if (k in compactValues) validationSnapshot[k] = { status: 'valid' };
            });
          } else {
            // mark fields with errors
            validationResult.error.issues.forEach((issue) => {
              const field = issue.path[0]?.toString();
              if (field) validationSnapshot[field] = { status: 'invalid', message: issue.message };
            });
            // fields without issues are valid
            Object.keys(compactValues).forEach((k) => {
              if (!validationSnapshot[k]) validationSnapshot[k] = { status: 'valid' };
            });
          }

          const draftPayload = {
            values: compactValues,
            classification: {
              departmentId: watchedDepartmentId || null,
              sectorId: watchedSectorId || null,
              generatedAipCode: aipCode || null,
              codePending: !!isGeneratingCode,
            },
            ui: {
              expandedSections,
              validationSnapshot,
            },
            meta: {
              lastSavedAt: new Date().toISOString(),
              schemaVersion: '1',
              deviceId: (localStorage.getItem('nbp_device_id')) || undefined,
            },
          };

          // Ensure device id exists
          if (!localStorage.getItem('nbp_device_id')) {
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
            localStorage.setItem('nbp_device_id', id);
            draftPayload.meta.deviceId = id;
          }

          localStorage.setItem('newProgramDraft', JSON.stringify(draftPayload));
          setLastSavedAt(new Date());
        } catch (err) {
          console.error('Failed to autosave draft:', err);
        }
      }
    }, 1000); // Autosave 1 second after changes stop

    return () => clearTimeout(timer);
  }, [editMode, isDirty, watchedDepartmentId, watchedSectorId, watchedProgramName, watchedAdditionalDescription, watchedPrimaryClusterId, watchedSglgIndicatorId, watchedExpectedOutput, watchedRemarks, aipCode, isGeneratingCode, expandedSections]);

  // Load draft from localStorage on mount — create only, same reason as the autosave above.
  useEffect(() => {
    if (editMode) return;
    try {
      const savedDraft = localStorage.getItem('newProgramDraft');
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);

        // Backwards-compat: older drafts may have been just values object
        const values = draft.values || draft;

        // Reset form with restored values
        reset({
          departmentId: values.departmentId || '',
          papClass: values.papClass || '',
          sectorId: values.sectorId || '',
          programName: values.programName || '',
          additionalDescription: values.additionalDescription || '',
          primaryClusterId: values.primaryClusterId || '',
          subFinishLineId: values.subFinishLineId || '',
          sdgGoalIds: [],
          sglgIndicatorId: values.sglgIndicatorId || '',
          expectedOutput: values.expectedOutput || '',
          remarks: values.remarks || '',
        });

        // Restore aip code (show as pending until regenerated/validated)
        if (draft.classification?.generatedAipCode) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setAipCode(draft.classification.generatedAipCode);
        }

        // Restore UI context
        if (draft.ui && Array.isArray(draft.ui.expandedSections)) {
          setExpandedSections(draft.ui.expandedSections);
        }

        // Restore meta timestamp
        if (draft.meta?.lastSavedAt) {
          try {
            setLastSavedAt(new Date(draft.meta.lastSavedAt));
          } catch {
            // ignore
          }
        }

        // Re-run validation and count invalid fields
        try {
          const revalidation = newProgramSchema.safeParse(values);
          if (revalidation.success) {
            setInvalidFieldCount(0);
          } else {
            setInvalidFieldCount(revalidation.error.issues.length);
          }
          // Show recovered banner (will auto-hide if valid)
          setShowRecoveredBanner(true);
        } catch (e) {
          console.error('Revalidation failed:', e);
        }
      }
    } catch (err) {
      console.error('Failed to load draft:', err);
    }
  }, [editMode, reset]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const result = await loadNewProgramReference();
      if ('error' in result) {
        setReferenceError(result.error);
      } else {
        setDepartments(result.data.departments);
        setOffices(result.data.offices);
        setOwnOrgId(result.data.ownOrgId);
        setSectors(result.data.sectors);
        setClusters(result.data.finishLines);
        setSglgIndicators(result.data.sglgIndicators);
        setSdgGoals(result.data.sdgGoals);
        // Editing an existing program shows the fiscal year it actually
        // belongs to, which may not be whichever cycle is open right now.
        const initCycle = init['aipCycle'] as Record<string, unknown> | undefined;
        const initFy = typeof initCycle?.['fiscalYear'] === 'number' ? (initCycle['fiscalYear'] as number) : null;
        const cycleFy = result.data.cycle?.fiscalYear ?? null;
        const fy = editMode ? (initFy ?? cycleFy) : cycleFy;
        setFiscalYear(fy);
        // The rest of this block seeds a *blank* create form — defaulting the
        // office to the caller's own org, and the period to the open cycle's
        // year. Doing either while editing would overwrite the program's
        // actual office/period with values that only make sense for a new one.
        if (!editMode) {
          if (result.data.ownOrgId) {
            reset((prev) => ({ ...prev, departmentId: result.data.ownOrgId! }));
          }
          if (cycleFy) {
            reset((prev) => ({
              ...prev,
              implementationStartMonth: prev.implementationStartMonth ?? 1,
              implementationStartYear: prev.implementationStartYear ?? cycleFy,
              implementationEndMonth: prev.implementationEndMonth ?? 12,
              implementationEndYear: prev.implementationEndYear ?? cycleFy,
            }));
          }
          if (!result.data.cycle) {
            setReferenceError(
              'No AIP cycle is currently open. Programs can only be created while a cycle is open.',
            );
          }
        } else if (!result.data.ownOrgId) {
          // Super-admin edit: `officeListIsImplementing` renders a single
          // combined picker bound to `supportingOfficeIds` alone (index 0 is
          // the primary, mirrored into `departmentId`). The API returns the
          // primary as a separate `officeId` and `supportingOffices` as only
          // the *additional* offices, so `editDefaultValues.supportingOfficeIds`
          // never contains the primary — the picker renders empty, and worse,
          // the mirror effect above (which assumes super-admin from mount,
          // before `ownOrgId` resolves) immediately wipes `departmentId` back
          // to '' from that empty list. Read the primary from `editDefaultValues`
          // (closed over `initialData`, unaffected by that race) rather than
          // `getValues`, and seed it back into `supportingOfficeIds`; the mirror
          // effect then restores `departmentId` on its next run.
          const currentSupp = getValues('supportingOfficeIds') ?? [];
          const primaryOfficeId = editDefaultValues.departmentId;
          if (primaryOfficeId && !currentSupp.includes(primaryOfficeId)) {
            setValue('supportingOfficeIds', [primaryOfficeId, ...currentSupp]);
          }
        }
      }
      setDepartmentsLoading(false);
      setSectorsLoading(false);
      setClustersLoading(false);
    };

    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, reset, getValues, setValue]);

  // Auto-generate AIP code when department and sector are selected
  useEffect(() => {
    if (watchedDepartmentId && watchedSectorId) {
      const generateCode = async () => {
        setIsGeneratingCode(true);
        setCodeGenerationError(undefined);

        const result = await previewProgramAipCode(
          watchedDepartmentId,
          watchedSectorId,
          watchedPapClass || undefined,
        );
        if ('error' in result) {
          setCodeGenerationError(result.error);
        } else {
          setAipCode(result.code);
        }
        setIsGeneratingCode(false);
      };

      // Debounce code generation
      const timer = setTimeout(generateCode, 300);
      return () => clearTimeout(timer);
    } else {
      /* eslint-disable react-hooks/set-state-in-effect */
      setAipCode(undefined);
      setCodeGenerationError(undefined);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    // papClass is segment 5 of the code and the bucket its ordinal restarts
    // in, so the preview has to re-run when the PAP class field changes.
  }, [watchedDepartmentId, watchedSectorId, watchedPapClass]);

  // Handle unsaved changes protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Auto-dismiss recovery banner when errors are cleared
  useEffect(() => {
    if (showRecoveredBanner && !manuallyDismissedBanner && Object.keys(errors).length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRecoveredBanner(false);
    }
  }, [errors, showRecoveredBanner, manuallyDismissedBanner]);


  // Navigation guards
  const handleNavigation = useCallback((callback: () => void) => {
    if (isDirty) {
      setPendingNavigation(() => callback);
      setShowUnsavedChangesDialog(true);
    } else {
      callback();
    }
  }, [isDirty]);

  const closeOrBack = useCallback(() => {
    handleNavigation(() => {
      if (onNavigateToRegistry) {
        onNavigateToRegistry();
      } else {
        router.push('/aip-registry');
      }
    });
  }, [handleNavigation, onNavigateToRegistry, router]);
  useEffect(() => {
    if (closeRequestRef) closeRequestRef.current = closeOrBack;
  }, [closeRequestRef, closeOrBack]);

  // Handle form submission
  const onSubmit = async (data: NewProgramFormValues) => {
    setIsSubmitting(true);
    setSubmitError(undefined);

    if (
      fiscalYear &&
      (data.implementationStartYear < fiscalYear || data.implementationEndYear < fiscalYear)
    ) {
      setSubmitError(`Implementation period year cannot be before FY ${fiscalYear}.`);
      setIsSubmitting(false);
      return;
    }

    try {
      if (editMode && init['id']) {
        const programId = String(init['id']);
        const result = await updateProgramAction(programId, {
          // Omitted rather than sent empty: `departmentId` defaults to '' when
          // initialData carries no office, and an empty id would 404 server-side.
          ...(data.departmentId ? { officeId: data.departmentId } : {}),
          // Explicit null when unticked: this is the only way to turn a
          // component program back into an ordinary one.
          hostOfficeId: data.isComponentProgram ? (data.hostOfficeId ?? null) : null,
          // Explicit values in both directions, for the same reason as the
          // host office: unticking has to be able to turn the costs back off.
          ...(data.hasOwnCosts
            ? {
                costMode: 'DIRECT_COSTS' as const,
                fundSources: data.fundSources,
                psProposedTotal: data.psProposedTotal ?? '0.00',
                mooeProposedTotal: data.mooeProposedTotal ?? '0.00',
                feProposedTotal: data.feProposedTotal ?? '0.00',
                coProposedTotal: data.coProposedTotal ?? '0.00',
                // [] when not split: returns a split program to one total.
                fundAllocations: data.splitByFund ? toFundAllocations(data.fundAllocations) : [],
              }
            : {
                costMode: 'ACTIVITY_CHILDREN' as const,
                fundSources: [],
                psProposedTotal: null,
                mooeProposedTotal: null,
                feProposedTotal: null,
                coProposedTotal: null,
              }),
          papSectorId: data.sectorId,
          ...(data.papClass ? { papClass: data.papClass } : {}),
          finishLineId: data.primaryClusterId,
          subFinishLineId: data.subFinishLineId ? data.subFinishLineId : null,
          sglgIndicatorId: data.sglgIndicatorId ? data.sglgIndicatorId : null,
          name: data.programName,
          description: data.additionalDescription ?? null,
          remarks: data.remarks ?? null,
          expectedOutput: data.expectedOutput,
          // Cleared means cleared: the edit form always sends this field.
          targetForBudgetYear: data.targetForBudgetYear ?? null,
          implementationStartMonth: data.implementationStartMonth,
          implementationStartYear: data.implementationStartYear,
          implementationEndMonth: data.implementationEndMonth,
          implementationEndYear: data.implementationEndYear,
          // Super-admin's combined picker puts the primary office at index 0
          // of `supportingOfficeIds` (see the office-merge effect above); the
          // API rejects a supporting office that duplicates `officeId`, so
          // strip it the same way the create path does.
          supportingOfficeIds: isSuperAdmin
            ? data.supportingOfficeIds.slice(1)
            : data.supportingOfficeIds,
          sdgGoalIds: data.sdgGoalIds,
        });

        if ('error' in result) {
          setSubmitError(result.error);
        } else {
          toast.success('Program updated.');
          onSaved?.(programId);
        }
        return;
      }

      const validatedData = newProgramSchema.parse(data);
      // In super-admin mode the first office is the primary implementing office
      // (sent as the program's city office via departmentId); the remaining
      // selections are the actual supporting offices.
      const payloadData = isSuperAdmin
        ? { ...validatedData, supportingOfficeIds: validatedData.supportingOfficeIds.slice(1) }
        : validatedData;
      const result = await submitNewProgram(payloadData);
      if ('error' in result) {
        setSubmitError(result.error);
      } else {
        toast.success('Program saved as draft.', {
          // A program that states its own costs cannot hold projects or activities.
          description: data.hasOwnCosts
            ? `${data.programName} is saved with its own costs.`
            : `${data.programName} is ready for project entries.`,
          action: data.hasOwnCosts ? undefined : {
            label: 'Add Project',
            onClick: () => {
              if (onNavigateToProject) {
                onNavigateToProject(result.id);
              } else {
                router.push(`/programs/${result.id}/add-project`);
              }
            },
          },
        });
        reset();
        // Clear saved draft on successful submission
        localStorage.removeItem('newProgramDraft');
        setLastSavedAt(null);
        onSaved?.(result.id);
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (embedded) {
    return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex flex-col gap-4 border-b border-slate-200 px-6 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  AIP Registry{fiscalYear ? ` · FY ${fiscalYear}` : ''}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="min-w-0 truncate text-xl font-semibold text-slate-950">
                    {editMode ? (watchedProgramName?.trim() || 'Edit program') : 'New program'}
                  </h2>
                  {editMode && onNavigate && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onNavigate(-1)}
                        disabled={!canNavigatePrev}
                        aria-label="Previous row"
                        title="Previous row"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate(1)}
                        disabled={!canNavigateNext}
                        aria-label="Next row"
                        title="Next row"
                        className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={closeOrBack}
                aria-label="Close"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition-colors hover:bg-slate-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-slate-700">
                  <span className="font-semibold text-slate-950">{completedCount}</span> of{' '}
                  {requiredChecks.length} required fields complete
                </span>
                <span className="text-slate-500">
                  {allRequiredComplete ? 'Ready to save' : `${requiredChecks.length - completedCount} left`}
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-200"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <nav className="-mb-px flex gap-1 overflow-x-auto">
              {tabs.map((tab, i) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => goToSection(i)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                    activeTab === i
                      ? 'border-primary text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px]',
                      tab.complete
                        ? 'bg-emerald-500 text-white'
                        : activeTab === i
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {tab.complete ? '✓' : i + 1}
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </header>

          <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
            <div
              ref={scrollRef}
              onScroll={handleBodyScroll}
              className="min-h-0 flex-1 overflow-y-auto px-6"
            >
              {referenceError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{editMode ? 'Cannot Load Program' : 'Cannot Create Program'}</AlertTitle>
                  <AlertDescription>{referenceError}</AlertDescription>
                </Alert>
              )}

              {submitError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{editMode ? 'Failed to Save Changes' : 'Failed to Create Program'}</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              {!editMode && showRecoveredBanner && !manuallyDismissedBanner && (
                <Alert className="mt-4 flex items-start justify-between">
                  <div>
                    <AlertTitle>Recovered Draft</AlertTitle>
                    <AlertDescription className="text-xs">
                      {invalidFieldCount > 0
                        ? `This draft has ${invalidFieldCount} field${invalidFieldCount === 1 ? '' : 's'} that need attention.`
                        : 'Recovered from this device'}
                      {lastSavedAt && (
                        <div className="mt-1 text-xs font-normal">
                          Last saved {new Date(lastSavedAt).toLocaleString()}
                        </div>
                      )}
                    </AlertDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        try {
                          localStorage.removeItem('newProgramDraft');
                          setShowRecoveredBanner(false);
                          setManuallyDismissedBanner(false);
                          setInvalidFieldCount(0);
                          reset({
                            departmentId: '',
                            papClass: '',
                            sectorId: '',
                            programName: '',
                            additionalDescription: '',
                            primaryClusterId: '',
                            subFinishLineId: '',
                            sdgGoalIds: [],
                            sglgIndicatorId: '',
                            expectedOutput: '',
                            remarks: '',
                          });
                          setAipCode(undefined);
                          setLastSavedAt(null);
                        } catch (e) {
                          console.error('Failed to start fresh:', e);
                        }
                      }}
                    >
                      Start Fresh
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setManuallyDismissedBanner(true)}
                    >
                      Keep Editing
                    </Button>
                  </div>
                </Alert>
              )}

              <section id="sec-identity" className="flex flex-col gap-5 py-6">
                <SectionHeading
                  n={1}
                  title="Program identity"
                  description="What the program is and when it runs."
                />
                <ProgramIdentitySection
                  variant="drawer"
                  part="identity"
                  control={control}
                  departments={departments}
                  offices={offices}
                  ownOrgId={ownOrgId}
                  sectors={sectors}
                  errors={errors}
                  fiscalYear={fiscalYear}
                  departmentsLoading={departmentsLoading}
                  sectorsLoading={sectorsLoading}
                  isGeneratingCode={isGeneratingCode}
                  officeListIsImplementing={isSuperAdmin}
                  locked={locked}
                />
              </section>

              <section id="sec-office" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                <SectionHeading
                  n={2}
                  title="Implementing office"
                  description="The first office is the primary office and sets the sector. Add up to 4 supporting offices."
                />
                <ProgramIdentitySection
                  variant="drawer"
                  part="office"
                  control={control}
                  departments={departments}
                  offices={offices}
                  ownOrgId={ownOrgId}
                  sectors={sectors}
                  aipCode={aipCode}
                  isGeneratingCode={isGeneratingCode}
                  codeGenerationError={codeGenerationError}
                  departmentsLoading={departmentsLoading}
                  sectorsLoading={sectorsLoading}
                  errors={errors}
                  fiscalYear={fiscalYear}
                  officeListIsImplementing={isSuperAdmin}
                  locked={locked}
                />
              </section>

              <section id="sec-align" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                <SectionHeading
                  n={3}
                  title="Strategic alignment"
                  description={`Link the program to the ${GOALS} and other government priorities.`}
                />
                <StrategicAlignmentSection
                  variant="drawer"
                  part="alignment"
                  control={control}
                  setValue={setValue}
                  clusters={clusters}
                  sdgGoals={sdgGoals}
                  sglgIndicators={sglgIndicators}
                  clustersLoading={clustersLoading}
                  errors={errors}
                  locked={locked}
                />
              </section>

              <section id="sec-outputs" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                <SectionHeading
                  n={4}
                  title="Outputs and budget"
                  badge="all optional"
                  description="You can leave these blank and fill them in later."
                />
                <StrategicAlignmentSection
                  variant="drawer"
                  part="outputs"
                  control={control}
                  setValue={setValue}
                  clusters={clusters}
                  sdgGoals={sdgGoals}
                  sglgIndicators={sglgIndicators}
                  clustersLoading={clustersLoading}
                  errors={errors}
                />
                <ProgramCostSection
                  variant="drawer"
                  control={control}
                  errors={errors}
                  setValue={setValue}
                  disabled={hasProjectActivities}
                />
              </section>

              {showTagsAndClimate && Boolean(init['id']) && (
                <>
                  <section id="sec-tags" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                    <SectionHeading n={5} title="Thematic tags" badge="optional" description="Saved immediately — not part of this form's save." />
                    <ProgramThematicTagSection
                      programId={String(init['id'])}
                      tags={(init['thematicTags'] as { id: string; name: string }[] | undefined) ?? []}
                    />
                  </section>
                  <section id="sec-climate-tagging" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                    <SectionHeading n={6} title="Climate tagging" badge="optional" description="Saved immediately — not part of this form's save." />
                    <ProgramClimateTagCard programId={String(init['id'])} />
                  </section>
                </>
              )}

              {!editMode && (
              <div className="mb-6 flex flex-col gap-3 rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">What happens after you save</p>
                <ol className="flex flex-col gap-3">
                  {afterSteps.map((step) => (
                    <li key={step.title} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700">
                        {afterSteps.indexOf(step) + 1}
                      </span>
                      <span className="flex flex-col gap-0.5 pt-px">
                        <span className="text-[13.5px] font-medium text-slate-950">{step.title}</span>
                        <span className="text-xs text-slate-500">{step.body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
              )}
            </div>

            <footer className="flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                {editMode ? (
                  <span className="truncate text-xs text-slate-500">
                    {!allRequiredComplete ? `Still needed: ${missingLabels.join(', ')}` : 'Ready to save.'}
                  </span>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5 text-[13px] text-slate-700">
                      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-emerald-500" />
                      {lastSavedAt
                        ? `Draft saved at ${new Date(lastSavedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                        : 'Not yet saved'}
                    </span>
                    <span className="truncate text-xs text-slate-500">{footerNextLabel}</span>
                  </>
                )}
              </div>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeOrBack}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !!referenceError || !allRequiredComplete}
                title={!allRequiredComplete ? 'Complete required fields first' : undefined}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : editMode ? (
                  'Save Changes'
                ) : (
                  'Save program'
                )}
              </Button>
            </footer>
          </form>
        </div>

        <Dialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Unsaved Changes</DialogTitle>
              <DialogDescription>
                You have unsaved changes. Are you sure you want to leave without saving?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>
                Keep Editing
              </DialogClose>
              <Button
                variant="destructive"
                onClick={() => {
                  setShowUnsavedChangesDialog(false);
                  pendingNavigation?.();
                }}
              >
                Leave Without Saving
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <>
      <section className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              onClick={() => handleNavigation(() => {
                if (onNavigateToRegistry) {
                  onNavigateToRegistry();
                } else {
                  router.push('/aip-registry');
                }
              })}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Registry
            </Button>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Annual Investment Program
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
                New Program Entry
              </h1>
              {fiscalYear && (
                <span className="inline-flex h-5 items-center rounded-md border border-blue-200 bg-blue-50 px-2 text-xs font-medium text-blue-800">
                  FY {fiscalYear}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
              Create a new program record and align it with the LGU&apos;s {goals}.
            </p>
          </div>
        </div>
      </section>

      {/* Form Content */}
      <form onSubmit={handleSubmit(onSubmit)} className="min-h-screen bg-slate-50/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-lg font-semibold text-slate-950">
                  Program Entry Progress
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Complete the required identity and strategic alignment fields before saving.
                </p>
              </div>
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800">
                {completedFieldsCount} of {requiredFields.length} required fields
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-4xl">
          {/* Reference / cycle availability Alert */}
          {referenceError && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cannot Create Program</AlertTitle>
              <AlertDescription>{referenceError}</AlertDescription>
            </Alert>
          )}

          {/* Submit Error Alert */}
          {submitError && (
            <Alert variant="destructive" className="mb-6">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Failed to Create Program</AlertTitle>
              <AlertDescription>
                {submitError}
              </AlertDescription>
            </Alert>
          )}

          {/* Recovered Draft Banner - Human-Friendly Summary */}
          {showRecoveredBanner && !manuallyDismissedBanner && (
            <Alert className="mb-4 flex items-start justify-between">
              <div>
                <AlertTitle>Recovered Draft</AlertTitle>
                <AlertDescription className="text-xs">
                  {invalidFieldCount > 0
                    ? `This draft has ${invalidFieldCount} field${invalidFieldCount === 1 ? '' : 's'} that need attention.`
                    : 'Recovered from this device'}
                  {lastSavedAt && (
                    <div className="mt-1 text-xs font-normal">
                      Last saved {new Date(lastSavedAt).toLocaleString()}
                    </div>
                  )}
                </AlertDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    // Start fresh: clear draft, metadata, and reset form
                    try {
                      localStorage.removeItem('newProgramDraft');
                      setShowRecoveredBanner(false);
                      setManuallyDismissedBanner(false);
                      setInvalidFieldCount(0);
                      reset({
                        departmentId: '',
                        papClass: '',
                        sectorId: '',
                        programName: '',
                        additionalDescription: '',
                        primaryClusterId: '',
                        subFinishLineId: '',
                        sdgGoalIds: [],
                        sglgIndicatorId: '',
                        expectedOutput: '',
                        remarks: '',
                      });
                      setAipCode(undefined);
                      setLastSavedAt(null);
                    } catch (e) {
                      console.error('Failed to start fresh:', e);
                    }
                  }}
                >
                  Start Fresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Dismiss banner for this session
                    setManuallyDismissedBanner(true);
                  }}
                >
                  Keep Editing
                </Button>
              </div>
            </Alert>
          )}

          {/* Section 1: Program Identity */}
          <ProgramIdentitySection
            control={control}
            departments={departments}
            offices={offices}
            ownOrgId={ownOrgId}
            sectors={sectors}
            aipCode={aipCode}
            isGeneratingCode={isGeneratingCode}
            codeGenerationError={codeGenerationError}
            departmentsLoading={departmentsLoading}
            sectorsLoading={sectorsLoading}
            errors={errors}
            fiscalYear={fiscalYear}
            officeListIsImplementing={isSuperAdmin}
          />

          {/* Spacer */}
          <div className="my-6 md:my-8" />

          {/* Section 2: Strategic Alignment */}
          <StrategicAlignmentSection
            control={control}
            setValue={setValue}
            clusters={clusters}
            sdgGoals={sdgGoals}
            sglgIndicators={sglgIndicators}
            clustersLoading={clustersLoading}
            errors={errors}
          />

          {/* Spacer */}
          <div className="my-6 md:my-8" />

          {/* Section 3: Programme costs — optional, and off by default */}
          <ProgramCostSection control={control} errors={errors} setValue={setValue} />

          {/* What happens after you save? */}
          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50/80 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 md:px-5 md:py-4 text-left"
              onClick={() => setShowWhatHappensNext((prev) => !prev)}
            >
              <span className="flex items-center gap-2 md:gap-3 text-xs md:text-sm font-medium text-blue-900">
                <Info className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0 text-blue-600" />
                What happens after you save?
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 flex-shrink-0 text-blue-500 transition-transform duration-200',
                  showWhatHappensNext && 'rotate-180'
                )}
              />
            </button>
            {showWhatHappensNext && (
              <div className="border-t border-blue-200 px-3.5 py-3 md:px-5 md:py-4 space-y-0.5 md:space-y-1">
                <p className="text-xs md:text-sm text-blue-800">
                  After saving, you&apos;ll be prompted to add{' '}
                  <strong className="font-semibold">Projects and Activities</strong>{' '}
                  under this program.
                </p>
                <p className="text-xs md:text-sm text-blue-800">
                  Budget costs are normally entered at the Project/Activity
                  level — unless you ticked{' '}
                  <strong className="font-semibold">
                    This program states its own costs
                  </strong>{' '}
                  above.
                </p>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Sticky Footer */}
        <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-sm md:px-8">
            <div className="mx-auto max-w-7xl">
            <div className="flex items-center justify-between gap-2 md:gap-3">
              <div className="text-xs md:text-sm text-slate-600 flex flex-col md:flex-row md:items-center gap-1 md:gap-2">
                <span className="font-medium">Status:</span>
                {lastSavedAt ? (
                  <span className="text-green-700 dark:text-green-400">Draft saved at {new Date(lastSavedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                ) : (
                  <span className="text-slate-500">Not yet saved</span>
                )}
              </div>
              <div className="flex flex-1 justify-end gap-2">
              <Button
                type="submit"
                disabled={isSubmitting || !!referenceError}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Program'
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSubmitting}
                onClick={() => handleNavigation(() => {
                  if (onNavigateToRegistry) {
                    onNavigateToRegistry();
                  } else {
                    router.push('/aip-registry');
                  }
                })}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
        </div>
      </form>

      {/* Unsaved Changes Dialog */}
      <Dialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Are you sure you want to leave without saving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>
              Keep Editing
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                setShowUnsavedChangesDialog(false);
                pendingNavigation?.();
              }}
            >
              Leave Without Saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SectionHeading({
  n,
  title,
  description,
  badge,
}: {
  n: number;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <div>
      <h3 className="text-base font-semibold text-slate-950">
        {n}. {title}
        {badge && <span className="ml-2 text-sm font-normal text-slate-400">{badge}</span>}
      </h3>
      <p className="mt-1 text-[13.5px] text-slate-500">{description}</p>
    </div>
  );
}
