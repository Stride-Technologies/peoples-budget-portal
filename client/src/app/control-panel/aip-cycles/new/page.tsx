'use client';

import { useActionState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createAipCycle } from '../_actions';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export default function NewAipCyclePage() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(createAipCycle, undefined);

  useEffect(() => {
    if (state && 'success' in state) {
      router.push('/control-panel/aip-cycles');
    }
  }, [state, router]);

  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-md space-y-6">
      <div>
        <Link
          href="/control-panel/aip-cycles"
          className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
        >
          ← Back to AIP Cycles
        </Link>
        <h1 className="text-xl font-bold text-neutral-900 mt-3">New AIP Cycle</h1>
        <p className="text-sm text-neutral-500 mt-0.5">
          Create a new Annual Investment Program cycle. It starts in PLANNING status — you can set budget ceilings before opening it for submissions.
        </p>
      </div>

      <form action={formAction} className="space-y-5">
        <div className="space-y-2">
          <label htmlFor="fiscalYear" className="block text-sm font-medium text-neutral-700">
            Fiscal Year
          </label>
          <Input
            id="fiscalYear"
            name="fiscalYear"
            type="number"
            min={2000}
            max={2100}
            defaultValue={currentYear + 1}
            placeholder={String(currentYear + 1)}
            required
            className="max-w-[160px]"
          />
          <p className="text-xs text-neutral-400">Must be unique — one cycle per fiscal year.</p>
        </div>

        {state && 'error' in state && (
          <p className="text-sm text-red-600 rounded-md bg-red-50 px-3 py-2 border border-red-200">
            {state.error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={isPending}>
            {isPending ? 'Creating…' : 'Create Cycle'}
          </Button>
          <Link
            href="/control-panel/aip-cycles"
            className="text-sm text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
