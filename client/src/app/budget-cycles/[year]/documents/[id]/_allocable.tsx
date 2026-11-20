'use client';

import { useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatPeso } from '@/lib/currency-formatter';
import { parseMoneyInput } from '@/lib/money-input';
import { setLepAllocable } from '../../../_actions';

/**
 * An LEP against its total allocable budget: over is a warning (amber), never
 * a block. A draft's allocable total can be revised as the estimates change.
 */
export function AllocablePanel({
  documentId,
  allocable,
  total,
  over,
  canEdit,
}: {
  documentId: string;
  allocable: string | null;
  total: string;
  over: string | null;
  canEdit: boolean;
}) {
  const pathname = usePathname();
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(allocable ?? '');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const amount = parseMoneyInput(raw);
  const isOver = over !== null && !over.startsWith('-') && !/^0*(\.0*)?$/.test(over);

  const save = () =>
    amount &&
    startTransition(async () => {
      const r = await setLepAllocable(documentId, amount, pathname);
      if ('error' in r) return setError(r.error);
      setError(null);
      setEditing(false);
    });

  return (
    <div
      className={`rounded-lg border px-5 py-4 ${
        isOver ? 'border-amber-300 bg-amber-50' : 'border-neutral-200 bg-white'
      }`}
    >
      <h2 className="text-sm font-semibold text-neutral-700">Total allocable budget</h2>
      {editing ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Input
            className="max-w-xs"
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
          />
          <Button size="sm" onClick={save} disabled={!amount || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={isPending}>
            Cancel
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-sm text-neutral-800">
          {allocable ? (
            <>
              <span className="font-medium tabular-nums">{formatPeso(allocable)}</span>. The LEP comes to{' '}
              <span className="tabular-nums">{formatPeso(total)}</span>
              {over === null ? '.' : isOver ? (
                <>
                  : <span className="font-medium text-amber-800">over by {formatPeso(over)}</span>.
                </>
              ) : (
                <>
                  , leaving <span className="text-green-700">{formatPeso(over.replace(/^-/, ''))}</span>{' '}
                  unallocated.
                </>
              )}
            </>
          ) : (
            <span className="text-neutral-500">Not declared.</span>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="ml-2 text-xs text-blue-700 hover:underline"
            >
              {allocable ? 'Change' : 'Declare'}
            </button>
          )}
        </p>
      )}
      {isOver && !editing && (
        <p className="mt-1 text-xs text-amber-800">
          The PPAs add up to more than the LGU can appropriate. Trim them before the LEP is submitted.
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}
