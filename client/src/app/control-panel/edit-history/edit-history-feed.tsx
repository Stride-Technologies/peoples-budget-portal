'use client';

import { useState } from 'react';
import { SimpleSelect } from '@/components/custom/simple-select';
import EditHistoryTab from '@/components/aip/edit-history-tab';

export function EditHistoryFeed({
  offices,
}: {
  offices: { id: string; acronym: string; name: string }[];
}) {
  const [officeId, setOfficeId] = useState('');
  return (
    <div className="max-w-3xl space-y-3 rounded-lg border border-neutral-200 bg-white p-4">
      <SimpleSelect
        aria-label="Filter by office"
        size="sm"
        className="h-8 w-auto min-w-56 text-xs"
        options={[
          { value: '', label: 'All offices' },
          ...offices.map((o) => ({ value: o.id, label: `${o.acronym} — ${o.name}` })),
        ]}
        value={officeId}
        onChange={setOfficeId}
      />
      <EditHistoryTab all officeId={officeId || undefined} />
    </div>
  );
}
