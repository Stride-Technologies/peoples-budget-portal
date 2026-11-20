'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { PapClass } from '@/lib/schemas';
import {
  reorderPayload,
  sectionSectors,
  type ReorderScopeProgram,
  type SectorGroup,
} from '@/lib/program-reorder';
import { loadProgramReorderScope, reorderPrograms } from './_reorder-actions';

export interface ReorderTarget {
  cycleId: string;
  officeId: string;
  officeLabel: string;
  papClass: PapClass;
  sectionLabel: string;
}

/**
 * Reorders the programs of one master-list section (an office's GAS, STO or
 * Operations). Programs only move within their PAP sector, because each sector
 * is a separate AIP-code scope; the server renumbers the tentative codes.
 */
export function ProgramReorderDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ReorderTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scope, setScope] = useState<ReorderScopeProgram[] | null>(null);
  const [sectors, setSectors] = useState<SectorGroup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState<{ sector: string; index: number } | null>(null);
  // Keeps the title filled while the dialog animates closed after `target`
  // clears; a new target also drops the previous section's rows.
  const [shown, setShown] = useState<ReorderTarget | null>(null);
  if (target && target !== shown) {
    setShown(target);
    setScope(null);
    setSectors([]);
    setError(null);
  }

  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    void loadProgramReorderScope(target.cycleId, target.officeId).then((res) => {
      if (cancelled) return;
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setScope(res.programs);
      setSectors(sectionSectors(res.programs, target.papClass));
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const original = scope && target ? sectionSectors(scope, target.papClass) : [];
  const changed = sectors.filter((s) => {
    const before = original.find((o) => o.papSectorId === s.papSectorId);
    return s.programs.some((p, i) => p.id !== before?.programs[i]?.id);
  });

  function move(sectorId: string, from: number, to: number) {
    if (from === to) return;
    setSectors((prev) =>
      prev.map((s) => {
        if (s.papSectorId !== sectorId) return s;
        const programs = [...s.programs];
        const [moved] = programs.splice(from, 1);
        programs.splice(to, 0, moved);
        return { ...s, programs };
      }),
    );
  }

  async function save() {
    if (!scope) return;
    setSaving(true);
    setError(null);
    for (const sector of changed) {
      const result = await reorderPrograms(
        reorderPayload(
          scope,
          sector.papSectorId,
          sector.programs.map((p) => p.id),
        ),
      );
      if ('error' in result) {
        setSaving(false);
        setError(result.error);
        return;
      }
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-x-hidden overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Reorder {shown?.officeLabel} · {shown?.sectionLabel}
          </DialogTitle>
          <DialogDescription>
            Drag a program, or use the arrows. Programs move within their PAP
            sector, and the AIP codes of the sector are renumbered when you save.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        {!scope && !error && (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading programs…
          </p>
        )}

        {sectors.map((sector) => (
          <section key={sector.papSectorId} className="min-w-0 space-y-1.5">
            {sectors.length > 1 && (
              <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                {sector.label}
              </h3>
            )}
            <ol className="space-y-1.5">
              {sector.programs.map((program, index) => (
                <li
                  key={program.id}
                  draggable
                  onDragStart={() => setDrag({ sector: sector.papSectorId, index })}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (drag?.sector === sector.papSectorId) {
                      move(sector.papSectorId, drag.index, index);
                    }
                    setDrag(null);
                  }}
                  onDragEnd={() => setDrag(null)}
                  className={cn(
                    'flex cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 text-sm',
                    drag?.sector === sector.papSectorId &&
                      drag.index === index &&
                      'border-blue-300 bg-blue-50',
                  )}
                >
                  <GripVertical className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                  <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900">{program.name}</span>
                    <span className="block font-mono text-xs text-slate-500">{program.code}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Move ${program.name} up`}
                    disabled={index === 0}
                    onClick={() => move(sector.papSectorId, index, index - 1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Move ${program.name} down`}
                    disabled={index === sector.programs.length - 1}
                    onClick={() => move(sector.papSectorId, index, index + 1)}
                    className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ))}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || changed.length === 0}>
            {saving ? 'Saving…' : 'Save order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
