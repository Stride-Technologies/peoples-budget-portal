'use client';

import { useState, useTransition } from 'react';
import { setBudgetCycleStage } from '../_actions';
import { BUDGET_STAGES } from '@/lib/budget-cycle';
import { Button } from '@/components/ui/button';

/**
 * Where this year's budget stands, 0–9, and the stages running alongside it.
 * It drives the home page's "where we are" note and /learn. Staff set it by hand,
 * because consultations and budget preparation leave no document to derive it
 * from. Execution and later are refused until the year has an enacted budget.
 */
export function StageSetter({
  aipCycleId,
  budgetCycleId,
  currentStage,
  alongsideStages,
}: {
  aipCycleId: string;
  budgetCycleId: string;
  currentStage: number;
  alongsideStages: number[];
}) {
  const [stage, setStage] = useState(currentStage);
  const [alongside, setAlongside] = useState<number[]>(alongsideStages);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const dirty =
    stage !== currentStage ||
    alongside.slice().sort().join() !== alongsideStages.slice().sort().join();

  function toggleAlongside(n: number) {
    setAlongside((a) => (a.includes(n) ? a.filter((x) => x !== n) : [...a, n]));
  }

  function save() {
    setMessage(null);
    startTransition(async () => {
      const result = await setBudgetCycleStage(
        aipCycleId,
        budgetCycleId,
        stage,
        alongside.filter((n) => n !== stage),
      );
      setMessage('error' in result ? { kind: 'error', text: result.error } : { kind: 'success', text: result.success });
    });
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-neutral-700">Current stage</span>
        <select
          className="mt-1 block w-full max-w-md rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm"
          value={stage}
          onChange={(e) => setStage(Number(e.target.value))}
          disabled={isPending}
        >
          {BUDGET_STAGES.map((s) => (
            <option key={s.n} value={s.n}>
              {s.n} · {s.title}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend className="text-sm text-neutral-700">Also under way</legend>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {BUDGET_STAGES.filter((s) => s.n !== stage).map((s) => (
            <label key={s.n} className="flex items-center gap-1.5 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={alongside.includes(s.n)}
                onChange={() => toggleAlongside(s.n)}
                disabled={isPending}
              />
              {s.n} · {s.title}
            </label>
          ))}
        </div>
      </fieldset>
      <Button variant="outline" disabled={isPending || !dirty} onClick={save}>
        {isPending ? 'Saving…' : 'Save stage'}
      </Button>
      {message && (
        <p className={`text-sm ${message.kind === 'error' ? 'text-red-600' : 'text-green-700'}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}
