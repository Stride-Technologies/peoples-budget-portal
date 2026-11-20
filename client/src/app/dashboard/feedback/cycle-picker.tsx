'use client';

import { useRouter } from 'next/navigation';
import type { AipCycleRecord } from '@/lib/api';
import { SimpleSelect } from '@/components/custom/simple-select';

export default function CyclePicker({
  cycles,
  selectedId,
}: {
  cycles: AipCycleRecord[];
  selectedId: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-neutral-600 font-medium">Cycle</label>
      <SimpleSelect
        aria-label="AIP cycle"
        size="sm"
        className="w-auto min-w-36"
        options={cycles.map((c) => ({
          value: c.id,
          label: `FY ${c.fiscalYear}${c.status === 'OPEN' ? ' (Active)' : ''}`,
        }))}
        value={selectedId}
        onChange={(next) => router.replace(`/dashboard/feedback?cycleId=${next}`)}
      />
    </div>
  );
}
