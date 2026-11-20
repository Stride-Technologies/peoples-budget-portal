"use client";

import { X } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
} from "@/components/ui/select";
import type { ClimateCodeRecord } from "@/lib/api";
import { cn } from "@/lib/utils";

interface ClimateCodePickerProps {
  value: string[];
  onChange: (ids: string[]) => void;
  climateCodes: ClimateCodeRecord[];
  invalid?: boolean;
  /** Shows a small CCA/CCM pillar tag on each chosen chip — the New Project/
   * Activity drawer's denser row layout; the default chip omits it. */
  showPillarTag?: boolean;
}

/**
 * Picks one or more CCET typology codes: the select adds a code, each chosen
 * code shows as a chip that removes it. A row can carry several (the city tags
 * CAgO's nursery "M114-04, M114-01").
 */
export function ClimateCodePicker({
  value,
  onChange,
  climateCodes,
  invalid,
  showPillarTag,
}: Readonly<ClimateCodePickerProps>) {
  const available = climateCodes.filter((c) => c.isActive && !value.includes(c.id));
  const groups: [string, ClimateCodeRecord[]][] = [
    ["CCA - Climate Change Adaptation", available.filter((c) => c.pillar === "ADAPTATION")],
    ["CCM - Climate Change Mitigation", available.filter((c) => c.pillar === "MITIGATION")],
  ];
  const chosen = value
    .map((id) => climateCodes.find((c) => c.id === id))
    .filter((c): c is ClimateCodeRecord => !!c);

  return (
    <div className="space-y-2">
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((c) => (
            <li
              key={c.id}
              className="flex max-w-full items-center gap-2 rounded-md border border-slate-200 bg-slate-50 py-1 pl-2 pr-1 text-xs text-slate-800"
            >
              <span className="font-mono font-semibold">{c.code}</span>
              <span className="truncate">{c.name}</span>
              {showPillarTag && (
                <span
                  className={cn(
                    'rounded px-1.5 py-0.5 text-[11px] font-medium',
                    c.pillar === 'ADAPTATION'
                      ? 'bg-cyan-100 text-cyan-800'
                      : 'bg-emerald-100 text-emerald-800',
                  )}
                >
                  {c.pillar === 'ADAPTATION' ? 'CCA' : 'CCM'}
                </span>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((id) => id !== c.id))}
                className="rounded p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900"
                aria-label={`Remove ${c.code}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Select value="" onValueChange={(id) => id && onChange([...value, String(id)])}>
        <SelectTrigger aria-invalid={invalid} className={cn("h-12 text-sm", invalid && "border-red-300")}>
          <span className="text-neutral-500">
            {chosen.length ? "Add another CCET code" : "Select CCET code"}
          </span>
        </SelectTrigger>
        <SelectContent className="max-h-[40vh] w-[min(78vw,560px)]" align="start" alignItemWithTrigger={false}>
          {groups.map(([label, codes], i) => (
            <SelectGroup key={label}>
              <SelectLabel className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">
                {label}
              </SelectLabel>
              {codes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-3 px-3 py-1.5">
                    <span className="w-20 shrink-0 font-mono text-sm text-slate-900">{c.code}</span>
                    <span className="min-w-0 text-sm text-neutral-700">{c.name}</span>
                  </div>
                </SelectItem>
              ))}
              {i === 0 && <SelectSeparator />}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
