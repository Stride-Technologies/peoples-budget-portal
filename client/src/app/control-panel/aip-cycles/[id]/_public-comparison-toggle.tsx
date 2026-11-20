'use client';

import { useState, useTransition } from 'react';
import { setCyclePublicComparison } from '../_actions';
import { Button } from '@/components/ui/button';

/**
 * Shows or hides the public Overview's comparison against the previous enacted
 * year.
 *
 * Deliberately a switch rather than a coverage threshold. The AIP fills up office
 * by office, and "+6% versus last year" drawn from a third of the offices is not
 * an approximation — it is a different number wearing the costume of an answer.
 * No rule knows when the budget office considers the proposal comparable, so this
 * is theirs to flip.
 */
export function PublicComparisonToggle({
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
      const result = await setCyclePublicComparison(cycleId, !enabled);
      setMessage(
        'error' in result
          ? { kind: 'error', text: result.error }
          : { kind: 'success', text: result.success },
      );
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={isPending}
          onClick={handleToggle}
        >
          {isPending
            ? 'Updating…'
            : enabled
              ? 'Hide the comparison'
              : 'Show the comparison'}
        </Button>
        <p className="text-sm text-neutral-600">
          {enabled
            ? 'The public Overview is comparing this cycle against last year.'
            : 'The public Overview is not comparing this cycle against last year.'}
        </p>
      </div>
      <p className="mt-2 max-w-prose text-xs text-neutral-500">
        Turn this on once enough offices have published that a year-on-year figure
        is fair. Until then the Overview reports what has been published without
        implying it is the whole budget.
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
