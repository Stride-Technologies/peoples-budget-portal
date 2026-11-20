"use client";

import { useEffect, useState, useCallback, useMemo, useRef, type RefObject } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import type { Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeft,
  AlertTriangle,
  ChevronUp,
  ChevronDown,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  makeAddProjectActivitySchema,
  AddProjectActivityFormValues,
  ProgramWithBudget,
  LineItem,
} from "@/lib/schemas";
import { addDecimalStrings } from "@/lib/currency-formatter";
import { cn } from "@/lib/utils";
import ProjectActivityContextRail from "@/components/project-activity/project-activity-context-rail";
import {
  loadProgramForPA,
  loadPAFormReference,
  submitProjectActivity,
  updateProjectActivity,
  previewPaAipCode,
} from "@/app/programs/[id]/add-project/_actions";
import { loadProjectActivityContext } from "@/components/project-activity/_actions";
import type { UacsObjectRecord, ClimateCodeRecord } from "@/lib/api";
import EntryTypeSelection from "@/components/project-activity/entry-type-selection";
import ProjectActivityDetailsSection from "@/components/project-activity/project-activity-details-section";
import CostBudgetProposalSection from "@/components/project-activity/cost-budget-proposal-section";
import ClimateChangeTaggingSection from "@/components/project-activity/climate-change-tagging-section";
import { ThematicTagSection } from "@/components/project-activity/thematic-tag-section";
import AddProjectSuccessModal from "@/components/project-activity/add-project-success-modal";

/** Fallback labels for fields whose zod issue carries no message. */
const FIELD_LABELS: Record<string, string> = {
  aipReferenceCode: "AIP reference code could not be generated — reload the page",
  projectActivityName: "Project / Activity name",
  psEstimate: "PS estimate",
  mooeEstimate: "MOOE estimate",
  feEstimate: "FE estimate",
  coEstimate: "CO estimate",
  implementationStartMonth: "Implementation start",
  implementationEndMonth: "Implementation end",
  ccetCodeIds: "CCET typology code",
};

interface AddProjectFormProps {
  programId?: string;
  projectId?: string;
  activityId?: string;
  editMode?: boolean;
  defaultEntryType?: "project" | "activity";
  /** Replaces every `router.push("/aip-registry")` — the drawer host passes a
   * close-and-refresh callback instead of a full-page navigation. Defaults to
   * the original behavior when omitted. */
  onNavigateAway?: () => void;
  /** Fires unconditionally right after a successful create or edit, with the
   * saved record's id — lets the drawer host refresh immediately rather than
   * waiting on the success modal or a navigation. */
  onSaved?: (id: string) => void;
  /** When set, a successful *create* (not edit) reports here instead of
   * showing the in-form success modal — the drawer host closes the drawer
   * and shows its own toast instead. Standalone-page callers (no drawer to
   * close) omit this and keep the modal. */
  onCreateSuccess?: (result: {
    id: string;
    entryType: "project" | "activity";
    entryName: string;
    programName: string;
  }) => void;
  /** Set to the form's guarded close, so a host Sheet's Escape / outside-press
   * dismissal asks about unsaved changes like the × and Cancel buttons do. */
  closeRequestRef?: RefObject<(() => void) | null>;
  /** Peek-navigation: steps the host's drawer to the next/previous row in the
   * registry table without closing the form. Edit-mode only. */
  onNavigate?: (direction: 1 | -1) => void;
  canNavigatePrev?: boolean;
  canNavigateNext?: boolean;
}

/**
 * Main form component for adding or editing projects or activities
 * Orchestrates sections, validation, and submission
 */
export default function AddProjectForm({
  programId,
  projectId,
  activityId,
  editMode = false,
  defaultEntryType = "project",
  onNavigateAway,
  onSaved,
  onCreateSuccess,
  closeRequestRef,
  onNavigate,
  canNavigatePrev = false,
  canNavigateNext = false,
}: Readonly<AddProjectFormProps>) {
  const router = useRouter();
  const navigateAway = onNavigateAway ?? (() => router.push("/aip-registry"));
  const [program, setProgram] = useState<ProgramWithBudget | null>(null);
  const [programLoading, setProgramLoading] = useState(true);
  const [resolvedProgramId, setResolvedProgramId] = useState<string | undefined>(programId);
  const [uacsObjects, setUacsObjects] = useState<UacsObjectRecord[]>([]);
  const [climateCodes, setClimateCodes] = useState<ClimateCodeRecord[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>();
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] =
    useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<() => void>();
  const [createdId, setCreatedId] = useState<string>();
  const [createdType, setCreatedType] = useState<"project" | "activity">();
  const [createdName, setCreatedName] = useState<string>();
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [codeGenerationError, setCodeGenerationError] = useState<string>();
  const [editingItem, setEditingItem] = useState<unknown>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [parentPeriod, setParentPeriod] = useState<{
    startMonth?: number | null;
    startYear?: number | null;
    endMonth?: number | null;
    endYear?: number | null;
  } | null>(null);

  // Determine the actual entry type for edit mode
  const entryTypeForForm = editMode
    ? (activityId ? "activity" : "project")
    : defaultEntryType;

  const schema = useMemo(
    () => makeAddProjectActivitySchema(
      !!(program?.implementationStartMonth && program?.implementationStartYear &&
         program?.implementationEndMonth && program?.implementationEndYear)
    ),

    [program?.implementationStartMonth, program?.implementationStartYear,
     program?.implementationEndMonth, program?.implementationEndYear],
  );

  // Initialize form
  const {
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isDirty },
    reset,
  } = useForm<AddProjectActivityFormValues>({
    resolver: zodResolver(schema) as Resolver<AddProjectActivityFormValues>,
    defaultValues: {
      entryType: entryTypeForForm,
      aipReferenceCode: "",
      projectActivityName: "",
      additionalDescription: "",
      expectedOutput: "",
      remarks: "",
      fundSources: [],
      splitByFund: false,
      fundAllocations: [],
      psEstimate: "",
      mooeEstimate: "",
      feEstimate: "",
      coEstimate: "",
      implementationStartMonth: undefined,
      implementationStartYear: undefined,
      implementationEndMonth: undefined,
      implementationEndYear: undefined,
      // Empty in Phase 1: the line-item block is deferred (D5), so seeding a
      // blank row would leave an unfillable required item in the form.
      lineItems: [],
      hasClimateTag: false,
    },
  });

  const watchedEntryType = useWatch({ control, name: "entryType" });
  // Whole-form watch drives the autosave. A hand-listed subset silently dropped
  // the estimates and period from the draft, and the restoring reset() then
  // wiped them from the form.
  const watchedAll = useWatch({ control });
  const currentEstimates = {
    ps: watchedAll.psEstimate,
    mooe: watchedAll.mooeEstimate,
    fe: watchedAll.feEstimate,
    co: watchedAll.coEstimate,
  };

  // Progress model (M varies by type/cost-structure/climate tagging — spec's
  // dynamic required-field count). Computed unconditionally since it reads
  // only already-watched values; cheap even on the first render.
  const isProjectEntry = watchedEntryType === 'project';
  const isDirectCost = !isProjectEntry || watchedAll.costMode !== 'ACTIVITY_CHILDREN';
  const isSplitByFund = !!watchedAll.splitByFund;
  const fundLines = watchedAll.fundAllocations ?? [];
  const fundsSatisfied = isSplitByFund
    ? fundLines.length > 0 && fundLines.every((l) => !!l?.fundSource)
    : (watchedAll.fundSources?.length ?? 0) > 0;
  const budgetTotal = isDirectCost
    ? Number(addDecimalStrings([
        watchedAll.psEstimate, watchedAll.mooeEstimate, watchedAll.feEstimate, watchedAll.coEstimate,
      ]) || 0)
    : 0;
  const isClimateTagged = !!watchedAll.hasClimateTag;
  const ccetCodeCount = watchedAll.ccetCodeIds?.length ?? 0;
  const climateTaggedTotal = Number(watchedAll.ccaAmount || 0) + Number(watchedAll.ccmAmount || 0);

  type Req = readonly [string, boolean];
  const requiredChecks: Req[] = [
    ['sec-type', true],
    ...(isProjectEntry ? [['sec-type', true] as Req] : []),
    ['sec-details', !!(watchedAll.projectActivityName ?? '').trim()],
    ...(isDirectCost
      ? [['sec-budget', fundsSatisfied] as Req, ['sec-budget', budgetTotal > 0] as Req]
      : []),
    ...(isClimateTagged
      ? [
          ['sec-climate', ccetCodeCount > 0] as Req,
          ['sec-climate', climateTaggedTotal > 0 && (!isDirectCost || climateTaggedTotal <= budgetTotal)] as Req,
        ]
      : []),
  ];
  const completedCount = requiredChecks.filter(([, ok]) => ok).length;
  const allRequiredComplete = completedCount === requiredChecks.length;
  const progressPct = (completedCount / requiredChecks.length) * 100;

  const missingLabels: string[] = [];
  if (!(watchedAll.projectActivityName ?? '').trim()) {
    missingLabels.push(isProjectEntry ? 'project name' : 'activity name');
  }
  if (isDirectCost && !fundsSatisfied) {
    missingLabels.push(isSplitByFund ? 'a fund for every row' : 'source of funds');
  }
  if (isDirectCost && budgetTotal <= 0) missingLabels.push('at least one amount');
  if (isClimateTagged) {
    if (ccetCodeCount === 0) missingLabels.push('a CCET code');
    if (climateTaggedTotal <= 0) missingLabels.push('a climate-tagged amount');
    else if (isDirectCost && climateTaggedTotal > budgetTotal) missingLabels.push('climate amount within the budget');
  }

  // Tags only apply to an existing row (nothing to tag before it's created),
  // so the section only appears once editing an existing project/activity.
  const taggableId = editMode ? (projectId || activityId) : undefined;
  const sectionDefs: readonly (readonly [string, string])[] = [
    ['sec-type', 'Type'],
    ['sec-details', 'Details'],
    ...(isDirectCost ? [['sec-budget', 'Budget'] as const] : []),
    ['sec-climate', 'Climate'],
    ...(taggableId ? [['sec-tags', 'Tags'] as const] : []),
  ];
  const sectionNumber = (id: string) => sectionDefs.findIndex(([secId]) => secId === id) + 1;
  const sectionIds = sectionDefs.map(([id]) => id);
  const tabs = sectionDefs.map(([id, label], i) => {
    const relevant = requiredChecks.filter(([secId]) => secId === id);
    return { id, label, i, complete: relevant.length > 0 && relevant.every(([, ok]) => ok) };
  });
  const safeActiveTab = Math.min(activeTab, tabs.length - 1);

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
      const t = el.querySelector<HTMLElement>(`#${id}`);
      if (t && t.offsetTop - el.offsetTop - 40 <= el.scrollTop) next = i;
    });
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 4) next = sectionIds.length - 1;
    if (next !== activeTab) setActiveTab(next);
  };

  const drawerFooterNextLabel = !allRequiredComplete
    ? `Still needed: ${missingLabels.join(', ')}`
    : 'Ready to save.';

  // Load program data and reference data
  useEffect(() => {
    const load = async () => {
      const effectiveProgramId = programId ?? resolvedProgramId;
      const itemId = editMode ? (activityId || projectId) : undefined;
      
      if (!effectiveProgramId && !itemId && !projectId) return;
      if (program && effectiveProgramId === program.id && (!editMode || editingItem)) return;
      
      try {
        let loadedProgramId = effectiveProgramId;
        
        // If editing, load the project/activity to get its program context
        if (editMode && itemId) {
          const projectResult = await loadProjectActivityContext(itemId);
          if ("error" in projectResult) {
            console.error("Failed to load existing item:", projectResult.error);
            return;
          }
          loadedProgramId = projectResult.programId;
          setEditingItem(projectResult);
          setResolvedProgramId(loadedProgramId);
        } else if (!editMode && projectId) {
          const projectResult = await loadProjectActivityContext(projectId);
          if ("error" in projectResult) {
            console.error("Failed to load parent project:", projectResult.error);
            return;
          }
          loadedProgramId = projectResult.programId;
          setResolvedProgramId(loadedProgramId);
          setParentPeriod({
            startMonth: projectResult.implementationStartMonth,
            startYear: projectResult.implementationStartYear,
            endMonth: projectResult.implementationEndMonth,
            endYear: projectResult.implementationEndYear,
          });
        }

        if (!loadedProgramId) return;

        const [programResult, refResult] = await Promise.all([
          loadProgramForPA(loadedProgramId),
          loadPAFormReference(),
        ]);

        if ("error" in programResult) {
          console.error("Failed to load program:", programResult.error);
        } else {
          setProgram(programResult.data);
        }

        if (!("error" in refResult)) {
          setUacsObjects(refResult.uacsObjects);
          setClimateCodes(refResult.climateCodes);
        }
      } catch (err) {
        console.error("Failed to load form data:", err);
      } finally {
        setProgramLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programId, projectId, activityId, editMode, resolvedProgramId, reloadKey]);

  // Preview the AIP code this project/activity would get.
  //
  // Server-derived, because the trailing ordinal is a rank among siblings the
  // client cannot count. This used to paste `-000` onto the program's code,
  // which is why the field read `…-000` no matter how many project/activities
  // the program already had. `projectId` being set means we are nesting under a
  // project that derives its cost from its activities, and the code grows the
  // extra 2-digit segment that says so.
  //
  // Edit mode is excluded: an existing row already has a code, and overwriting
  // it with "the next one" would show the wrong code and, saved, take a
  // sibling's. `reloadKey` is in the deps so "Add Another" re-previews and the
  // ordinal advances instead of repeating.
  useEffect(() => {
    if (editMode || !program) return;
    let cancelled = false;
    const generate = async () => {
      setIsGeneratingCode(true);
      setCodeGenerationError(undefined);
      const result = await previewPaAipCode(program.id, projectId);
      if (cancelled) return;
      if ("code" in result) {
        setValue("aipReferenceCode", result.code, {
          shouldDirty: false,
          shouldValidate: false,
        });
      } else {
        // Say why. The field is read-only and nobody can type a code in, so a
        // silent failure leaves the placeholder sitting there looking like the
        // form is still thinking — and submit then fails on a field the user
        // cannot fix. A stale API missing /aip-codes/preview-pa lands here.
        setCodeGenerationError(result.error);
      }
      setIsGeneratingCode(false);
    };
    generate();
    return () => {
      cancelled = true;
    };
  }, [program, projectId, editMode, setValue, reloadKey]);

  // Default implementation period from parent — only fills empty fields so saved drafts are respected
  useEffect(() => {
    if (editMode) return;
    const period = projectId
      ? parentPeriod
      : program
      ? {
          startMonth: program.implementationStartMonth,
          startYear: program.implementationStartYear,
          endMonth: program.implementationEndMonth,
          endYear: program.implementationEndYear,
        }
      : null;
    if (!period) return;
    const current = getValues(["implementationStartMonth", "implementationStartYear", "implementationEndMonth", "implementationEndYear"]);
    const [csm, csy, cem, cey] = current;
    if (csm == null && period.startMonth != null)
      setValue("implementationStartMonth", period.startMonth, { shouldDirty: false, shouldValidate: false });
    if (csy == null && period.startYear != null)
      setValue("implementationStartYear", period.startYear, { shouldDirty: false, shouldValidate: false });
    if (cem == null && period.endMonth != null)
      setValue("implementationEndMonth", period.endMonth, { shouldDirty: false, shouldValidate: false });
    if (cey == null && period.endYear != null)
      setValue("implementationEndYear", period.endYear, { shouldDirty: false, shouldValidate: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, projectId, parentPeriod, program]);

  // Autosave to localStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      // After a successful create the form is reset and the draft deleted — a
      // debounce still in flight would write a blank draft back over that.
      if (isDirty && program && !showSuccessModal) {
        try {
          const draftPayload = {
            values: getValues(),
            meta: {
              lastSavedAt: new Date().toISOString(),
              schemaVersion: "1",
            },
          };

          localStorage.setItem(
            `addProjectDraft-${programId ?? projectId}`,
            JSON.stringify(draftPayload),
          );
          setLastSavedAt(new Date());
        } catch (err) {
          console.error("Failed to autosave draft:", err);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isDirty, programId, projectId, program, watchedAll, getValues, showSuccessModal]);

  // Load draft from localStorage on mount
  useEffect(() => {
    try {
      // Clear any stale draft that was incorrectly keyed as "undefined"
      localStorage.removeItem('addProjectDraft-undefined');
      const savedDraft = localStorage.getItem(`addProjectDraft-${programId ?? projectId}`);
      if (savedDraft) {
        const draft = JSON.parse(savedDraft);
        if (draft.values) {
          // Merge over the current defaults: reset() replaces the whole form, so
          // any field missing from an older draft must fall back, not blank out.
          reset({ ...getValues(), ...draft.values });

          if (draft.meta?.lastSavedAt) {
            try {
              // eslint-disable-next-line react-hooks/set-state-in-effect
              setLastSavedAt(new Date(draft.meta.lastSavedAt));
            } catch {
              // ignore
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to load draft:", err);
    }
  }, [programId, projectId, reset, getValues]);

  // Prefill form when editing existing project/activity
  useEffect(() => {
    if (editMode && editingItem) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const item = editingItem as any;
      reset({
        entryType: item.entryType || watchedEntryType,
        aipReferenceCode: item.aipReferenceCode || "",
        projectActivityName: item.projectActivityName || item.projectName || "",
        additionalDescription: item.additionalDescription || item.description || "",
        expectedOutput: item.expectedOutput || "",
        remarks: item.remarks || "",
        // reset() replaces the whole form, so a field left out here is cleared
        // rather than kept — which is why the cost inputs came up blank when
        // reopening a PPA. proposedBudget is derived server-side from these
        // three and is not a form input.
        fundSources: item.fundSources ?? [],
        splitByFund: (item.fundAllocations ?? []).length > 0,
        fundAllocations: item.fundAllocations ?? [],
        psEstimate: item.psEstimate ?? "",
        mooeEstimate: item.mooeEstimate ?? "",
        feEstimate: item.feEstimate ?? "",
        coEstimate: item.coEstimate ?? "",
        implementationStartMonth: item.implementationStartMonth,
        implementationStartYear: item.implementationStartYear,
        implementationEndMonth: item.implementationEndMonth,
        implementationEndYear: item.implementationEndYear,
        costMode: item.costMode || "DIRECT_COSTS",
        lineItems: item.lineItems || [
          {
            id: crypto.randomUUID(),
            expenseClass: "MOOE",
            uacsObjectId: "",
            quantity: 1,
            unit: "",
            unitCost: 0,
            lineTotal: 0,
          } as LineItem,
        ],
        hasClimateTag: item.hasClimateTag || false,
        ccetCodeIds: item.ccetCodeIds ?? [],
        ccaAmount: item.ccaAmount,
        ccmAmount: item.ccmAmount,
        ccRemarks: item.ccRemarks,
      });
    }
  }, [editMode, editingItem, reset, watchedEntryType]);

  // Handle unsaved changes protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Navigation guards
  const handleNavigation = useCallback(
    (callback: () => void) => {
      if (isDirty) {
        setPendingNavigation(() => callback);
        setShowUnsavedChangesDialog(true);
      } else {
        callback();
      }
    },
    [isDirty],
  );
  useEffect(() => {
    if (closeRequestRef) closeRequestRef.current = () => handleNavigation(navigateAway);
  });

  // Handle form submission
  const onSubmit = async (data: AddProjectActivityFormValues) => {
    const targetProgramId = resolvedProgramId ?? programId;
    if (!targetProgramId) return;
    setIsSubmitting(true);
    setSubmitError(undefined);

    try {
      const validatedData = schema.parse(data);
      const itemId = projectId || activityId;

      let result: { id: string; tentativeAipReferenceCode: string } | { error: string };
      if (editMode && itemId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingLineItemIds = ((editingItem as any)?.lineItems ?? [] as { id?: string }[])
          .map((li: { id?: string }) => li.id)
          .filter((id: string | undefined): id is string => Boolean(id));
        result = await updateProjectActivity(itemId, validatedData, existingLineItemIds);
      } else {
        result = await submitProjectActivity(targetProgramId, validatedData, itemId);
      }

      if ("error" in result) {
        setSubmitError(result.error);
        toast.error(result.error);
        return;
      }

      onSaved?.(result.id);

      if (editMode) {
        // For edit mode, redirect to registry and close drawer
        navigateAway();
      } else if (onCreateSuccess) {
        // Drawer host closes the drawer and shows its own toast instead of
        // the in-form modal below.
        onCreateSuccess({
          id: result.id,
          entryType: data.entryType,
          entryName: data.projectActivityName,
          programName: program?.programName ?? "",
        });
        reset();
        localStorage.removeItem(`addProjectDraft-${programId ?? projectId}`);
        setLastSavedAt(null);
      } else {
        // Standalone-page fallback: show the in-form success modal.
        setCreatedId(result.id);
        setCreatedType(data.entryType);
        setCreatedName(data.projectActivityName);
        setShowSuccessModal(true);
        reset();
        localStorage.removeItem(`addProjectDraft-${programId ?? projectId}`);
        setLastSavedAt(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit project/activity";
      setSubmitError(message);
      toast.error(message);
      console.error("Submission error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const entryTypeLabel = watchedEntryType === "project" ? "Project" : "Activity";

  if (programLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
          <p className="text-sm text-muted-foreground">Loading program...</p>
        </div>
      </div>
    );
  }

  if (!program) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-4 h-8 w-8 text-destructive" />
          <p className="text-sm text-muted-foreground">Program not found</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-4 gap-2"
            onClick={() => navigateAway()}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Registry
          </Button>
        </div>
      </div>
    );
  }

  // While editing, name the actual row instead of its type — "Edit activity"
  // says nothing about *which* activity, and the entry type still reads from
  // the badge beside it. Creating has no name yet, so it keeps the generic label.
  const title = editMode
    ? (watchedAll.projectActivityName?.trim() || `Edit ${watchedEntryType === 'activity' ? 'activity' : 'project'}`)
    : (watchedEntryType === 'activity' ? 'New activity' : 'New project');
  const saveLabel = editMode
    ? `Save ${entryTypeLabel}`
    : (watchedEntryType === 'activity' ? 'Save activity' : 'Save project');
  const closeOrBack = () => handleNavigation(() => navigateAway());

  // The context rail shows "already under this program" plus "this entry" to
  // project a new total — correct while creating, but while editing, the item
  // being edited is itself one of `program.children` and already counted in
  // `totalProjectActivityCost`, so adding its live form values on top would
  // double it. Strip it out and net its original total back out instead.
  // `proposedBudget` is nullable on the server (legacy/imported rows can carry
  // PS/MOOE/FE/CO with no rolled-up proposedBudget persisted) — defaulting a
  // missing value straight to 0 silently un-strips this item's real cost,
  // leaving it double-counted once the live form values are added back on
  // top. Fall back to the PS+MOOE+FE+CO sum, same as the sibling rollup in
  // `loadProgramForPA` (`pa.proposedBudget ?? pa.grandTotal`).
  const editingOriginalTotal = editMode
    ? (() => {
        const item = editingItem as {
          proposedBudget?: string;
          psEstimate?: string;
          mooeEstimate?: string;
          feEstimate?: string;
          coEstimate?: string;
        } | null;
        if (!item) return 0;
        if (item.proposedBudget != null && item.proposedBudget !== '') {
          return Number(item.proposedBudget);
        }
        return (
          Number(item.psEstimate || 0) +
          Number(item.mooeEstimate || 0) +
          Number(item.feEstimate || 0) +
          Number(item.coEstimate || 0)
        );
      })()
    : 0;
  const railProgram = editMode && program
    ? {
        ...program,
        children: program.children.filter((c) => c.id !== (projectId || activityId)),
        totalProjectActivityCost: Math.max(0, program.totalProjectActivityCost - editingOriginalTotal),
      }
    : program;

  return (
      <>
        <div className="flex min-h-0 flex-1 flex-col">
          <header className="flex flex-col gap-4 border-b border-slate-200 px-6 pt-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  AIP Registry{program.implementationStartYear ? ` · FY ${program.implementationStartYear}` : ''}
                </span>
                <div className="flex min-w-0 items-center gap-1.5">
                  <h2 className="min-w-0 truncate text-xl font-semibold text-slate-950">{title}</h2>
                  {editMode && (
                    <Badge
                      variant="outline"
                      className="shrink-0 rounded px-1.5 py-0 text-[10px] font-normal text-slate-500"
                    >
                      {entryTypeLabel}
                    </Badge>
                  )}
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
                <p className="truncate text-[13.5px] text-slate-500">
                  Under <span className="font-medium text-slate-950">{program.programName}</span>
                </p>
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
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => goToSection(tab.i)}
                  className={cn(
                    'flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-[13.5px] font-medium transition-colors',
                    safeActiveTab === tab.i
                      ? 'border-primary text-slate-950'
                      : 'border-transparent text-slate-500 hover:text-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px]',
                      tab.complete
                        ? 'bg-emerald-500 text-white'
                        : safeActiveTab === tab.i
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-500',
                    )}
                  >
                    {tab.complete ? '✓' : tab.i + 1}
                  </span>
                  {tab.label}
                </button>
              ))}
            </nav>
          </header>

          <form
            id="add-project-form"
            onSubmit={handleSubmit(onSubmit, (errs) => {
              const messages = Object.entries(errs).map(
                ([field, err]) => (err as { message?: string })?.message ?? FIELD_LABELS[field] ?? field,
              );
              toast.error(
                messages.length === 1
                  ? messages[0]
                  : `${messages.length} fields need attention: ${messages.join('; ')}`,
              );
            })}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div
              ref={scrollRef}
              onScroll={handleBodyScroll}
              className="min-h-0 flex-1 overflow-y-auto"
            >
              {submitError && (
                <Alert variant="destructive" className="mx-6 mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>{submitError}</AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-start gap-x-10 px-6 pb-12 pt-2">
                <div className="flex min-w-0 flex-[999_1_560px] flex-col">
                  <section id="sec-type" className="flex flex-col gap-5 py-6">
                    <DrawerSectionHeading n={sectionNumber('sec-type')} title="What are you adding?" />
                    {/* Under a project the type is always Activity, as the page form's static "Activity" shows. */}
                    <EntryTypeSelection control={control} setValue={setValue} editMode={Boolean(projectId) || editMode} variant="drawer" />
                  </section>

                  <section id="sec-details" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                    <DrawerSectionHeading n={sectionNumber('sec-details')} title="Details" />
                    <ProjectActivityDetailsSection
                      control={control}
                      errors={errors}
                      isGeneratingCode={isGeneratingCode}
                      codeGenerationError={codeGenerationError}
                      parentStartMonth={program?.implementationStartMonth}
                      parentStartYear={program?.implementationStartYear}
                      parentEndMonth={program?.implementationEndMonth}
                      parentEndYear={program?.implementationEndYear}
                      variant="drawer"
                    />
                  </section>

                  {isDirectCost && (
                    <section id="sec-budget" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                      <DrawerSectionHeading n={sectionNumber('sec-budget')} title="Budget" />
                      <CostBudgetProposalSection
                        control={control}
                        errors={errors}
                        setValue={setValue}
                        uacsObjects={uacsObjects}
                        variant="drawer"
                      />
                    </section>
                  )}

                  <section id="sec-climate" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                    <DrawerSectionHeading
                      n={sectionNumber('sec-climate')}
                      title="Climate tagging"
                      badge="optional"
                    />
                    <ClimateChangeTaggingSection
                      control={control}
                      climateCodes={climateCodes}
                      errors={errors}
                      variant="drawer"
                    />
                  </section>

                  {taggableId && (
                    <section id="sec-tags" className="flex flex-col gap-5 border-t border-slate-100 py-6">
                      <DrawerSectionHeading
                        n={sectionNumber('sec-tags')}
                        title="Thematic tags"
                        badge="optional"
                      />
                      <ThematicTagSection projectActivityId={taggableId} />
                    </section>
                  )}
                </div>

                <div className="flex-[1_1_300px] py-6 lg:sticky lg:top-6">
                  <ProjectActivityContextRail program={railProgram} currentEstimates={currentEstimates} />
                </div>
              </div>
            </div>

            <footer className="flex items-center gap-4 border-t border-slate-200 bg-white px-6 py-3.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[13px] text-slate-700">
                  <span
                    className={cn(
                      'h-[7px] w-[7px] shrink-0 rounded-full',
                      lastSavedAt ? 'bg-emerald-500' : 'bg-slate-300',
                    )}
                  />
                  {lastSavedAt
                    ? `Draft saved at ${new Date(lastSavedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                    : 'Not saved yet'}
                </span>
                <span className="truncate text-xs text-slate-500">{drawerFooterNextLabel}</span>
              </div>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={closeOrBack}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !allRequiredComplete}
                title={!allRequiredComplete ? 'Complete required fields first' : undefined}
                className="gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  saveLabel
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

        {createdId && createdType && (
          <AddProjectSuccessModal
            open={showSuccessModal}
            programName={program?.programName}
            entryType={createdType}
            entryName={createdName}
            onNavigateAway={onNavigateAway}
            onAddAnother={() => {
              setShowSuccessModal(false);
              setProgram(null);
              setProgramLoading(true);
              setReloadKey((k) => k + 1);
            }}
          />
        )}
      </>
    );
}

function DrawerSectionHeading({ n, title, badge }: { n: number; title: string; badge?: string }) {
  return (
    <h3 className="text-base font-semibold text-slate-950">
      {n}. {title}
      {badge && <span className="ml-2 text-sm font-normal text-slate-400">{badge}</span>}
    </h3>
  );
}
