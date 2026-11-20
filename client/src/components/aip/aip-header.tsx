"use client";

import { useState } from "react";
import { LbpExportDialog, type LbpExportOptions, type LbpForm } from "@/components/aip/lbp-export-dialog";
import Link from "next/link";
import { Check, ChevronDown, ClipboardCheck, Download, FileCheck, MoreVertical, Plus, Send, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { AipCycleRecord } from "@/lib/api";
import { goal } from '@/lib/goal-label';


const CYCLE_STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-green-50 text-green-700 border-green-200",
  PLANNING: "bg-blue-50 text-blue-700 border-blue-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
  LOCKED: "bg-amber-50 text-amber-700 border-amber-200",
  ADOPTED: "bg-amber-50 text-amber-700 border-amber-200",
};

function FiscalYearSwitcher({
  cycles,
  selectedCycleId,
  onCycleChange,
}: {
  cycles: AipCycleRecord[];
  selectedCycleId: string | undefined;
  onCycleChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const selected = cycles.find((c) => c.id === selectedCycleId);
  const label = selected ? `FY ${selected.fiscalYear}` : "FY —";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-800 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label="Switch fiscal year"
      >
        {label}
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </PopoverTrigger>
      <PopoverContent className="w-52 p-0" align="start">
        <Command>
          <CommandList>
            <CommandEmpty>No AIP cycles found.</CommandEmpty>
            <CommandGroup heading="Fiscal Year">
              {cycles.map((cycle) => (
                <CommandItem
                  key={cycle.id}
                  value={cycle.id}
                  onSelect={() => {
                    onCycleChange(cycle.id);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between"
                >
                  <span className="font-medium">FY {cycle.fiscalYear}</span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        CYCLE_STATUS_STYLES[cycle.status] ?? "bg-slate-100 text-slate-600",
                      )}
                    >
                      {cycle.status}
                    </span>
                    {cycle.id === selectedCycleId && (
                      <Check className="size-3.5 text-blue-600" />
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface AIPHeaderProps {
  canSubmit?: boolean;
  submitBlockReason?: string | null;
  onNewProgram?: () => void;
  onSubmitAIP?: () => void;
  onSubmitForApproval?: () => void;
  /** When provided, renders the cluster batch-publish action (aip:publish). */
  onBatchPublish?: () => void;
  /** When provided, renders an "Endorser View" nav link for endorser HEADs. */
  endorserViewHref?: string;
  onExport?: () => void;
  exportMenu?: {
    canExportCluster: boolean;
    canChooseCluster: boolean;
    showCompleteExport: boolean;
    ownClusterId?: string | null;
    ownClusterLabel?: string | null;
    clusterOptions: Array<{ id: string; label: string }>;
    onExportCluster?: (clusterId?: string) => void;
    /** The city's Annual Budget sheet as Word; whole book when no office. */
    onExportAnnualBudget?: (officeId?: string) => void;
    /** The whole city AIP as Excel: a sheet per sector group, then fund sources. */
    onExportComplete?: () => void;
    /** LBP Forms 4 and 7 (specs/008). Form 7 is city-wide: all-offices users only. */
    onExportLbp?: (options: LbpExportOptions) => void;
    lbpOffices?: Array<{ id: string; label: string }>;
    /** The year's finalized LEP / Ordinance, offered as a figures source. */
    lbpDocuments?: Array<{ id: string; label: string }>;
    showForm7?: boolean;
    isExporting?: boolean;
  };
  cycles?: AipCycleRecord[];
  selectedCycleId?: string;
  onCycleChange?: (id: string) => void;
}

export default function AIPHeader({
  canSubmit = false,
  submitBlockReason = null,
  onNewProgram,
  onSubmitAIP,
  onSubmitForApproval,
  onBatchPublish,
  endorserViewHref,
  onExport,
  exportMenu,
  cycles = [],
  selectedCycleId,
  onCycleChange,
}: Readonly<AIPHeaderProps>) {
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [showClusterDialog, setShowClusterDialog] = useState(false);
  const [selectedExportClusterId, setSelectedExportClusterId] = useState<string>("");
  const [lbpForm, setLbpForm] = useState<LbpForm | null>(null);

  const handleSubmitClick = () => {
    setShowConfirmDialog(true);
  };

  const handleSubmitConfirm = () => {
    setShowConfirmDialog(false);
    onSubmitAIP?.();
  };

  const handleClusterExportClick = () => {
    if (!exportMenu?.canExportCluster) return;

    if (exportMenu.canChooseCluster) {
      // Default the selection when the dialog opens (avoids a setState-in-effect).
      setSelectedExportClusterId(
        exportMenu.ownClusterId ?? exportMenu.clusterOptions[0]?.id ?? "",
      );
      setShowClusterDialog(true);
      return;
    }

    exportMenu.onExportCluster?.(exportMenu.ownClusterId ?? undefined);
  };

  const handleConfirmClusterExport = () => {
    exportMenu?.onExportCluster?.(selectedExportClusterId || undefined);
    setShowClusterDialog(false);
  };

  const selectedClusterLabel =
    exportMenu?.clusterOptions.find((cluster) => cluster.id === selectedExportClusterId)
      ?.label ?? exportMenu?.ownClusterLabel ?? null;

  return (
    <>
      <section className="w-full border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Annual Investment Program
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
                AIP Registry
              </h1>
              {onCycleChange ? (
                <FiscalYearSwitcher
                  cycles={cycles}
                  selectedCycleId={selectedCycleId}
                  onCycleChange={onCycleChange}
                />
              ) : (
                <Badge
                  variant="secondary"
                  className="rounded-md border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-50"
                >
                  {cycles.find((c) => c.id === selectedCycleId)
                    ? `FY ${cycles.find((c) => c.id === selectedCycleId)!.fiscalYear}`
                    : "FY —"}
                </Badge>
              )}
            </div>
            <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
              Operational PPA register for budgeting, review, and strategic{' '}
              {goal} alignment.
            </p>
          </div>

          <div className="hidden flex-col gap-2 sm:flex-row sm:flex-wrap md:flex md:justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    aria-label="Open export menu"
                    disabled={!exportMenu?.canExportCluster && !exportMenu?.showCompleteExport}
                  >
                    <Download className="size-4" />
                    Export
                    <ChevronDown className="size-4" />
                  </Button>
                }
              />
              <DropdownMenuContent align="end" sideOffset={6} className="w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>
                    {exportMenu?.canChooseCluster
                      ? "Export a cluster workbook"
                      : exportMenu?.ownClusterLabel
                        ? `Exports ${exportMenu.ownClusterLabel}`
                        : "Export options"}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={handleClusterExportClick}
                    disabled={!exportMenu?.canExportCluster || exportMenu?.isExporting}
                  >
                    Export by Cluster
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                  {/* The city's own Annual Budget sheet, as Word — the format
                      the budget office works in, unlike the cluster workbook. */}
                  <DropdownMenuItem
                    onClick={() => exportMenu?.onExportAnnualBudget?.()}
                    disabled={
                      !exportMenu?.canExportCluster || exportMenu?.isExporting
                    }
                  >
                    Export Annual Budget (Word)
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                  {/* LBP forms for the budget hearings: read-only workbooks,
                      one fund each. Form 7 covers the whole LGU, so only users who
                      see every office get it — the API enforces that too. */}
                  <DropdownMenuItem
                    onClick={() => setLbpForm(4)}
                    disabled={!exportMenu?.canExportCluster || exportMenu?.isExporting}
                  >
                    LBP Form 4 (Excel)…
                  </DropdownMenuItem>
                  {exportMenu?.showForm7 ? (
                    <DropdownMenuItem
                      onClick={() => setLbpForm(7)}
                      disabled={exportMenu?.isExporting}
                    >
                      LBP Form 7 (Excel)…
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
                {exportMenu?.showCompleteExport ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuGroup>
                      {/* Every office in one workbook. City-wide by definition,
                          so the API refuses a caller scoped to some offices —
                          this gate is the hint, not the enforcement. */}
                      <DropdownMenuItem
                        onClick={() => exportMenu?.onExportComplete?.()}
                        disabled={exportMenu?.isExporting}
                      >
                        Export Complete AIP (Excel)
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {endorserViewHref && (
              <Link href={endorserViewHref} className={buttonVariants({ variant: 'outline' })}>
                <ClipboardCheck className="size-4" />
                Endorser View
              </Link>
            )}

            {onBatchPublish && (
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" onClick={onBatchPublish} />}>
                  <Upload className="size-4" />
                  Publish cluster
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Publishes every ready AIP entry in a cluster. Blocked entries
                  are skipped, not failed.
                </TooltipContent>
              </Tooltip>
            )}

            {onSubmitForApproval && (
              <Tooltip>
                <TooltipTrigger render={<Button variant="outline" onClick={onSubmitForApproval} />}>
                  <FileCheck className="size-4" />
                  Submit for Approval
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  Submits all Head-Reviewed programs for LFC sequential approval.
                </TooltipContent>
              </Tooltip>
            )}

            {onSubmitAIP !== undefined && (!canSubmit && submitBlockReason ? (
              <Tooltip>
                <TooltipTrigger
                  onClick={handleSubmitClick}
                  className="inline-flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
                >
                  <Send className="size-4" />
                  Submit AIP
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs">
                  <p>{submitBlockReason}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="secondary"
                onClick={handleSubmitClick}
                disabled={!canSubmit}
              >
                <Send className="size-4" />
                Submit AIP
              </Button>
            ))}

            {onNewProgram && (
              <Button onClick={onNewProgram}>
                <Plus className="size-4" />
                New Program
              </Button>
            )}
          </div>

          <div className="flex gap-2 md:hidden">
            {onNewProgram && (
              <Button onClick={onNewProgram} className="flex-1 sm:flex-none">
                <Plus className="size-4" />
                New Program
              </Button>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger
                className="h-10 w-10"
                aria-label="More actions"
              >
                <MoreVertical className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {onSubmitAIP !== undefined && (
                  <>
                    <DropdownMenuItem
                      onClick={handleSubmitClick}
                      disabled={!canSubmit}
                      className={cn(!canSubmit && "cursor-not-allowed opacity-50")}
                    >
                      Submit AIP
                    </DropdownMenuItem>
                    {!canSubmit && submitBlockReason && (
                      <div className="pointer-events-none px-2 py-1.5 text-xs text-slate-500">
                        {submitBlockReason}
                      </div>
                    )}
                  </>
                )}
                {onSubmitForApproval && (
                  <DropdownMenuItem onClick={onSubmitForApproval} className="flex-col items-start gap-0 py-2">
                    <span className="text-sm font-medium">Submit for Approval</span>
                    <span className="text-xs text-slate-500">Head-Reviewed → Pending Approval (LFC)</span>
                  </DropdownMenuItem>
                )}
                {endorserViewHref && (
                  <DropdownMenuItem>
                    <Link href={endorserViewHref} className="w-full">Endorser View</Link>
                  </DropdownMenuItem>
                )}
                {onExport !== undefined && (
                  <DropdownMenuItem onClick={onExport}>Export</DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleClusterExportClick}
                  disabled={!exportMenu?.canExportCluster || exportMenu?.isExporting}
                >
                  Export by Cluster
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setLbpForm(4)}
                  disabled={!exportMenu?.canExportCluster || exportMenu?.isExporting}
                >
                  LBP Form 4 (Excel)…
                </DropdownMenuItem>
                {exportMenu?.showForm7 ? (
                  <DropdownMenuItem
                    onClick={() => setLbpForm(7)}
                    disabled={exportMenu?.isExporting}
                  >
                    LBP Form 7 (Excel)…
                  </DropdownMenuItem>
                ) : null}
                {exportMenu?.showCompleteExport ? (
                  <DropdownMenuItem
                    onClick={() => exportMenu?.onExportComplete?.()}
                    disabled={exportMenu?.isExporting}
                  >
                    Export Complete AIP (Excel)
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </section>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit AIP</DialogTitle>
            <DialogDescription>
              This will submit the current Annual Investment Program for review.
              Please ensure all entries are complete and accurate before
              proceeding.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmDialog(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleSubmitConfirm}>Submit for Review</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LbpExportDialog
        form={lbpForm}
        onClose={() => setLbpForm(null)}
        offices={exportMenu?.lbpOffices ?? []}
        documents={exportMenu?.lbpDocuments ?? []}
        onExport={(options) => exportMenu?.onExportLbp?.(options)}
        isExporting={exportMenu?.isExporting}
      />

      <Dialog open={showClusterDialog} onOpenChange={setShowClusterDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export by Cluster</DialogTitle>
            <DialogDescription>
              Choose which cluster to export. The generated workbook should match
              the structure in <span className="font-medium">AIP 2027 - Safe &amp; Secure Communities (1).xlsx</span>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <label
                htmlFor="cluster-export-select"
                className="text-sm font-medium text-slate-900"
              >
                Cluster
              </label>
              <Select
                value={selectedExportClusterId}
                onValueChange={(value) => setSelectedExportClusterId(value ?? "")}
              >
                <SelectTrigger
                  id="cluster-export-select"
                  className="w-full"
                >
                  <SelectValue>
                    {(value: string | null) => {
                      if (!value) return "Select a cluster";
                      return (
                        exportMenu?.clusterOptions.find((cluster) => cluster.id === value)?.label ??
                        "Select a cluster"
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {exportMenu?.clusterOptions.map((cluster) => (
                    <SelectItem key={cluster.id} value={cluster.id}>
                      {cluster.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <p className="text-xs text-slate-500">
              {selectedClusterLabel
                ? `The current scaffold targets ${selectedClusterLabel}.`
                : "Pick a cluster to continue."}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowClusterDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmClusterExport}
              disabled={!selectedExportClusterId || exportMenu?.isExporting}
            >
              Export Cluster
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
