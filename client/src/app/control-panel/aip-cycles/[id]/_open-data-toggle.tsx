'use client';

import { useState, useTransition } from 'react';
import { setCycleOpenData } from '../_actions';
import { Button } from '@/components/ui/button';

/**
 * Opens or closes this year's open data: the yearly download on /developers and
 * the public open-data API. Off by default, so nothing is shared until a super
 * admin decides to (specs/007). It publishes only what the public site already
 * shows.
 */
export function OpenDataToggle({
  cycleId,
  enabled,
}: {
  cycleId: string;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<
    { kind: 'error' | 'success'; text: string } | null
  >(null);

  function handleToggle() {
    setMessage(null);
    startTransition(async () => {
      const result = await setCycleOpenData(cycleId, !enabled);
      setMessage(
        'error' in result
          ? { kind: 'error', text: result.error }
          : { kind: 'success', text: result.success },
      );
    });
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-neutral-700">Open data</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={isPending} onClick={handleToggle}>
          {isPending
            ? 'Updating…'
            : enabled
              ? 'Switch off open data'
              : 'Switch on open data'}
        </Button>
        <p className="text-sm text-neutral-600">
          {enabled
            ? 'This year can be downloaded and read through the public API.'
            : 'This year reads “Coming soon” on the developers page.'}
        </p>
      </div>
      <p className="mt-2 max-w-prose text-xs text-neutral-500">
        Makes this year&apos;s published budget downloadable and available through
        the public API. Nothing is shared until this is on.
      </p>
      {message && (
        <p
          className={`mt-2 text-sm ${
            message.kind === 'error' ? 'text-red-600' : 'text-green-700'
          }`}
          role="status"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
