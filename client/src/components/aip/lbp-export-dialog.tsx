"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FUND_SOURCES, type FundSource } from "@/lib/schemas";

export type LbpForm = 4 | 7;
export type LbpFigures = "working" | "published" | "document";

export interface LbpExportOptions {
  form: LbpForm;
  /** Form 4 only; omitted = every office in the caller's scope. */
  officeId?: string;
  fund: FundSource;
  figures: LbpFigures;
  /** With figures "document": the LEP or Ordinance. */
  documentId?: string;
}

const ALL = "__all__";

/**
 * Options for LBP Forms 4 and 7 (specs/008): which office (Form 4), which
 * fund (General Fund by default) and which figures. Figures has no default on
 * purpose — a DRAFT form and a published one must never be mixed up by a
 * forgotten choice.
 */
export function LbpExportDialog({
  form,
  onClose,
  offices,
  documents = [],
  onExport,
  isExporting,
}: Readonly<{
  form: LbpForm | null;
  onClose: () => void;
  offices: Array<{ id: string; label: string }>;
  /** The year's finalized LEP / Ordinance (specs/012 P6); none = the option is hidden. */
  documents?: Array<{ id: string; label: string }>;
  onExport: (options: LbpExportOptions) => void;
  isExporting?: boolean;
}>) {
  const [officeId, setOfficeId] = useState(ALL);
  const [fund, setFund] = useState<FundSource>("GF");
  const [figures, setFigures] = useState<LbpFigures | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);

  const submit = () => {
    if (!form || !figures) return;
    onExport({
      form,
      fund,
      figures,
      ...(figures === "document" && documentId ? { documentId } : {}),
      ...(form === 4 && officeId !== ALL ? { officeId } : {}),
    });
    onClose();
  };

  return (
    <Dialog open={form !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {form === 7
              ? "LBP Form No. 7 — Statement of Fund Allocation by Sector"
              : "LBP Form No. 4 — Mandate, MFO, Indicators and Targets"}
          </DialogTitle>
          <DialogDescription>
            A read-only Excel workbook for one fund. A Notes sheet lists the
            programs that need attention before it is submitted.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {form === 4 ? (
            <div className="space-y-2">
              <label htmlFor="lbp-office" className="text-sm font-medium text-slate-900">
                Office
              </label>
              <Select value={officeId} onValueChange={(v) => setOfficeId(v ?? ALL)}>
                <SelectTrigger id="lbp-office" className="w-full">
                  <SelectValue>
                    {(value: string | null) =>
                      !value || value === ALL
                        ? "Every office I can export (one sheet each)"
                        : (offices.find((o) => o.id === value)?.label ?? "Select an office")
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Every office I can export (one sheet each)</SelectItem>
                  {offices.map((office) => (
                    <SelectItem key={office.id} value={office.id}>
                      {office.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-2">
            <label htmlFor="lbp-fund" className="text-sm font-medium text-slate-900">
              Fund
            </label>
            <Select value={fund} onValueChange={(v) => setFund((v as FundSource) ?? "GF")}>
              <SelectTrigger id="lbp-fund" className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    FUND_SOURCES.find((f) => f.value === value)?.description ?? "General Fund"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {FUND_SOURCES.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">Figures</legend>
            {(
              [
                ["working", "Working figures", "Every program as it stands now, drafts included. Marked DRAFT."],
                ["published", "Published figures only", "What the public sees. Programs never published are left out."],
                ...documents.map(
                  (d) =>
                    [`document:${d.id}`, d.label, "The budget as that document states it, row for row."] as const,
                ),
              ] as const
            ).map(([value, label, hint]) => (
              <label
                key={value}
                className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 has-[:checked]:border-slate-900"
              >
                <input
                  type="radio"
                  name="lbp-figures"
                  value={value}
                  checked={
                    value.startsWith("document:")
                      ? figures === "document" && documentId === value.slice(9)
                      : figures === value
                  }
                  onChange={() => {
                    if (value.startsWith("document:")) {
                      setFigures("document");
                      setDocumentId(value.slice(9));
                    } else {
                      setFigures(value as LbpFigures);
                      setDocumentId(null);
                    }
                  }}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-900">{label}</span>
                  <span className="block text-xs text-slate-500">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!figures || isExporting}>
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
