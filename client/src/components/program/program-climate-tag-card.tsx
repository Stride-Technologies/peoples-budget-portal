"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/custom/currency-input";
import { ClimateCodePicker } from "@/components/climate/climate-code-picker";
import type { ClimateCodeRecord } from "@/lib/api";
import {
  loadProgramClimateTagAction,
  saveProgramClimateTagAction,
} from "@/app/programs/[id]/_actions";

/**
 * The climate tag on the program itself — for a program that states its own
 * costs, or a parent row the city tagged directly (HSDO `11.`). PPA tags are
 * edited on each PPA. An amount with no code blocks publishing, which is why
 * this card exists: it is where the office adds the missing code.
 */
export function ProgramClimateTagCard({ programId }: Readonly<{ programId: string }>) {
  const [codes, setCodes] = useState<ClimateCodeRecord[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [cca, setCca] = useState("");
  const [ccm, setCcm] = useState("");
  const [remarks, setRemarks] = useState("");
  const [hasTag, setHasTag] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    loadProgramClimateTagAction(programId).then((res) => {
      setLoading(false);
      if ("error" in res) return setMessage({ kind: "error", text: res.error });
      setCodes(res.codes);
      if (res.tag) {
        setHasTag(true);
        setIds(res.tag.codes.map((c) => c.ccetCodeId));
        setCca(res.tag.ccaAmount ?? "");
        setCcm(res.tag.ccmAmount ?? "");
        setRemarks(res.tag.remarks ?? "");
      }
    });
  }, [programId]);

  const save = (remove = false) =>
    startTransition(async () => {
      const res = await saveProgramClimateTagAction(
        programId,
        remove
          ? null
          : { ccetCodeIds: ids, ccaAmount: cca || undefined, ccmAmount: ccm || undefined, remarks: remarks || undefined },
      );
      if ("error" in res) return setMessage({ kind: "error", text: res.error });
      setHasTag(!!res.tag);
      if (!res.tag) {
        setIds([]);
        setCca("");
        setCcm("");
        setRemarks("");
      }
      setMessage({ kind: "ok", text: remove ? "Climate tag removed." : "Climate tag saved." });
    });

  if (loading) {
    return (
      <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-6">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  const uncoded = hasTag && ids.length === 0 && (Number(cca) > 0 || Number(ccm) > 0);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-100 px-5 py-3">
        <h3 className="text-base font-semibold text-slate-950">Program climate change tag</h3>
        <p className="mt-1 text-xs text-slate-600">
          For climate spending stated on the program itself. Tags on individual PPAs are edited on each PPA.
        </p>
      </div>
      <div className="space-y-4 p-5">
        {uncoded && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This program has a climate amount but no CCET code. It can’t be published until a code is added.
          </p>
        )}
        <div className="space-y-1.5">
          <label className="text-xs md:text-sm font-medium text-neutral-900">CCET Typology Codes</label>
          <ClimateCodePicker value={ids} onChange={setIds} climateCodes={codes} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-medium text-neutral-900">CCA Amount (₱)</label>
            <CurrencyInput value={cca} onChange={setCca} placeholder="0.00" className="text-xs font-mono" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs md:text-sm font-medium text-neutral-900">CCM Amount (₱)</label>
            <CurrencyInput value={ccm} onChange={setCcm} placeholder="0.00" className="text-xs font-mono" />
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs md:text-sm font-medium text-neutral-900">Remarks / Justification</label>
          <Textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Explain the climate change linkage"
            className="min-h-20 resize-none text-xs"
          />
        </div>
        {message && (
          <p className={message.kind === "ok" ? "text-xs text-green-700" : "text-xs text-red-600"}>{message.text}</p>
        )}
        <div className="flex justify-end gap-2">
          {hasTag && (
            <Button type="button" variant="outline" onClick={() => save(true)} disabled={pending}>
              Remove tag
            </Button>
          )}
          <Button type="button" onClick={() => save()} disabled={pending || (ids.length === 0 && !cca && !ccm)}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save climate tag
          </Button>
        </div>
      </div>
    </section>
  );
}
