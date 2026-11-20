'use client';

import { useState, useTransition } from 'react';
import { setCyclePublicOverview } from '../_actions';
import { Button } from '@/components/ui/button';
import type { PublicOverviewSection } from '@/lib/api';

const ROWS: { section: PublicOverviewSection; label: string; path: string }[] = [
  { section: 'AIP', label: 'AIP Overview', path: 'aip' },
  { section: 'ANNUAL', label: 'Annual Budget Overview', path: 'annual' },
  { section: 'PPMP', label: 'PPMP Overview', path: 'ppmp' },
];

/**
 * One switch per public section's Overview tab for this year. Hidden, the tab
 * disappears and the Overview URL sends visitors to Browse instead.
 *
 * A year is in the AIP section, the Annual Budget section, or both (the API's
 * `sections`, specs/012). A switch for a section the year is not in can still
 * be set ahead — enacting a year shows whatever its Annual switch says.
 */
export function PublicOverviewSwitches({
  cycleId,
  fiscalYear,
  sections,
  enabled,
}: {
  cycleId: string;
  fiscalYear: number;
  sections: ('aip' | 'annual')[];
  enabled: Record<PublicOverviewSection, boolean>;
}) {
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<PublicOverviewSection | null>(null);
  const [message, setMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null);

  function toggle(section: PublicOverviewSection) {
    setMessage(null);
    setBusy(section);
    startTransition(async () => {
      const result = await setCyclePublicOverview(cycleId, section, !enabled[section]);
      setBusy(null);
      setMessage(
        'error' in result
          ? { kind: 'error', text: result.error }
          : { kind: 'success', text: result.success },
      );
    });
  }

  const live: Record<PublicOverviewSection, boolean> = {
    AIP: sections.includes('aip'),
    ANNUAL: sections.includes('annual'),
    PPMP: true,
  };

  return (
    <div>
      <ul className="divide-y divide-neutral-200 rounded-md border border-neutral-200">
        {ROWS.map((row) => (
          <li key={row.section} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-800">
                {row.label}
                {!live[row.section] && (
                  <span className="ml-2 text-xs font-normal text-neutral-500">
                    {row.section === 'ANNUAL' ? 'applies once this year’s budget is enacted' : 'not live — this year has no public AIP'}
                  </span>
                )}
              </p>
              <p className="text-xs text-neutral-500">
                {enabled[row.section] ? 'Shown' : 'Hidden'} at /{row.path}/{fiscalYear}/overview
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => toggle(row.section)}
            >
              {busy === row.section ? 'Updating…' : enabled[row.section] ? 'Hide' : 'Show'}
            </Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 max-w-prose text-xs text-neutral-500">
        Show an Overview once enough offices have published for its figures to
        describe the year. Hidden, visitors land on Browse.
      </p>
      {message && (
        <p
          className={`mt-2 text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-green-700'}`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
