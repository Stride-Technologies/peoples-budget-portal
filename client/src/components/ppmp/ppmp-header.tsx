'use client';

import { Download, Upload, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SimpleSelect } from '@/components/custom/simple-select';
import type { AipCycleRecord } from '@/lib/api';

interface PpmpHeaderProps {
  cycles: AipCycleRecord[];
  selectedCycleId: string | undefined;
  onCycleChange: (id: string) => void;
  onExport: () => void;
  isExporting?: boolean;
  onPublishAll?: () => void;
  onNewPpmp: () => void;
}

export default function PpmpHeader({
  cycles,
  selectedCycleId,
  onCycleChange,
  onExport,
  isExporting = false,
  onPublishAll,
  onNewPpmp,
}: Readonly<PpmpHeaderProps>) {
  const cycleOptions = cycles.map((c) => ({
    value: c.id,
    label: `FY ${c.fiscalYear}`,
  }));

  return (
    <section className="w-full border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 md:flex-row md:items-end md:justify-between lg:px-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Project Procurement Management Plan
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight text-slate-950">
              PPMP Registry
            </h1>
            <SimpleSelect
              options={cycleOptions}
              value={selectedCycleId ?? ''}
              onChange={onCycleChange}
              size="sm"
              placeholder="FY —"
              aria-label="Switch fiscal year"
            />
          </div>
          <p className="mt-2 max-w-3xl text-base leading-7 text-slate-600">
            Procurement plans by office — standalone from your AIP programs.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap md:justify-end">
          <Button variant="outline" onClick={onExport} disabled={isExporting}>
            <Download className="size-4" />
            {isExporting ? 'Exporting…' : 'Export'}
          </Button>

          {onPublishAll && (
            <Button variant="outline" onClick={onPublishAll}>
              <Upload className="size-4" />
              Publish all
            </Button>
          )}

          <Button onClick={onNewPpmp}>
            <Plus className="size-4" />
            New Project
          </Button>
        </div>
      </div>
    </section>
  );
}
