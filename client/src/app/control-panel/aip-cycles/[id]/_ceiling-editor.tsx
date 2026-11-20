'use client';

import { useActionState, useRef, useState } from 'react';
import { saveCeiling } from '../_actions';
import type { FinishLineCeilingRecord, FinishLineRecord } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/custom/currency-input';
import { GOAL } from '@/lib/goal-label';


function CeilingRow({
  finishLine,
  ceiling,
  cycleId,
  disabled,
}: {
  finishLine: FinishLineRecord;
  ceiling: FinishLineCeilingRecord | undefined;
  cycleId: string;
  disabled: boolean;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  // Kept as the decimal string the API already sends and `saveCeiling` already
  // expects — no parseFloat/toFixed round-trip on a Decimal(18,2) value.
  const [ceilingAmount, setCeilingAmount] = useState<string>(
    ceiling?.totalCeiling ?? '',
  );

  const boundAction = saveCeiling.bind(null, cycleId, finishLine.id, ceiling?.id ?? null);
  const [state, formAction, isPending] = useActionState(boundAction, undefined);

  return (
    <tr className="border-b border-neutral-100 last:border-0">
      <td className="px-4 py-3 align-top">
        <p className="text-sm font-medium text-neutral-800">{finishLine.name}</p>
        {finishLine.fullName && (
          <p className="text-xs text-neutral-400 mt-0.5 leading-tight">{finishLine.fullName}</p>
        )}
      </td>
      <td className="px-4 py-3" colSpan={3}>
        {disabled ? (
          <div className="space-y-1">
            <p className="text-sm text-neutral-600">
              {ceiling ? (
                <span className="font-medium">₱{parseFloat(ceiling.totalCeiling).toLocaleString('en-PH')}</span>
              ) : (
                <span className="text-neutral-400 italic">Not set</span>
              )}
            </p>
          </div>
        ) : (
          <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">Total Ceiling (₱)</label>
              <input type="hidden" name="totalCeiling" value={ceilingAmount} />
              <CurrencyInput
                value={ceilingAmount}
                onChange={setCeilingAmount}
                placeholder="0.00"
                className="w-36 text-sm"
              />
            </div>
            <Button type="submit" size="sm" disabled={isPending} variant="outline">
              {isPending ? 'Saving…' : ceiling ? 'Update' : 'Set'}
            </Button>
            {state && 'error' in state && (
              <p className="text-xs text-red-600 w-full">{state.error}</p>
            )}
            {state && 'success' in state && (
              <p className="text-xs text-green-600 w-full">{state.success}</p>
            )}
          </form>
        )}
      </td>
    </tr>
  );
}

export function CeilingEditor({
  cycleId,
  finishLines,
  ceilings,
  disabled,
}: {
  cycleId: string;
  finishLines: FinishLineRecord[];
  ceilings: FinishLineCeilingRecord[];
  disabled: boolean;
}) {
  const ceilingByFL = new Map(ceilings.map((c) => [c.finishLineId, c]));

  return (
    <div className="rounded-lg border border-neutral-200 bg-white overflow-hidden">
      {disabled && (
        <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
          Budget ceilings can only be set or updated while the cycle is Planning or Open.
        </div>
      )}
      <table className="w-full text-sm">
        <thead className="bg-neutral-50 border-b border-neutral-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500 w-2/5">
              {GOAL}
            </th>
            <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500" colSpan={3}>
              Budget Ceiling
            </th>
          </tr>
        </thead>
        <tbody>
          {finishLines.map((fl) => (
            <CeilingRow
              key={fl.id}
              finishLine={fl}
              ceiling={ceilingByFL.get(fl.id)}
              cycleId={cycleId}
              disabled={disabled}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
