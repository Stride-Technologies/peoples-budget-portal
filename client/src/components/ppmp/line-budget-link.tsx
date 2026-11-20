'use client';

import { useEffect, useState, useTransition } from 'react';
import type { PpmpLineItemRecord, PpmpLinkOption, PpmpRecord } from '@/lib/api';
import { loadPpmpLinkOptions, setPpmpLineLink } from '@/app/ppmp-registry/[id]/_actions';

const keyOf = (field: string, id: string) => `${field}:${id}`;

/**
 * The budget row a line is bought for (specs/012 D8): an AIP program or PA of
 * the office while the Project is Indicative, an enacted Ordinance PPA once it
 * is Final. Optional; the Project's "Funding AIP Program" text stays as typed.
 */
export default function LineBudgetLink({
  ppmp,
  li,
  onSaved,
}: Readonly<{
  ppmp: PpmpRecord;
  li: PpmpLineItemRecord;
  onSaved: (lineItem: PpmpLineItemRecord) => void;
}>) {
  const [options, setOptions] = useState<PpmpLinkOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    loadPpmpLinkOptions(ppmp.id).then((r) =>
      'error' in r ? setError(r.error) : setOptions(r.options),
    );
  }, [ppmp.id]);

  const current = li.budgetItemId
    ? { key: keyOf('budgetItemId', li.budgetItemId), target: li.budgetItem }
    : li.projectActivityId
      ? { key: keyOf('projectActivityId', li.projectActivityId), target: li.projectActivity }
      : li.programId
        ? { key: keyOf('programId', li.programId), target: li.program }
        : null;
  // A link to a row that is no longer offered (deleted from the AIP) still shows.
  const stale = current && options && !options.some((o) => keyOf(o.field, o.id) === current.key);

  const save = (value: string) =>
    startTransition(async () => {
      setError(null);
      const option = options?.find((o) => keyOf(o.field, o.id) === value) ?? null;
      const r = await setPpmpLineLink(ppmp.id, li.id, option);
      if ('error' in r) setError(r.error);
      else onSaved(r.lineItem);
    });

  return (
    <div className="mt-2 rounded-md border border-slate-100 bg-white px-3 py-2">
      <label className="grid grid-cols-[160px_1fr] items-center gap-2">
        <span className="text-xs font-medium text-slate-500">
          {ppmp.kind === 'FINAL' ? 'Ordinance PPA' : 'AIP program or PA'}
        </span>
        <select
          className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:opacity-60"
          value={current?.key ?? ''}
          disabled={options === null || pending}
          onChange={(e) => save(e.target.value)}
        >
          <option value="">{options === null && !error ? 'Loading…' : 'Not linked'}</option>
          {stale && (
            <option value={current.key}>
              {current.target?.name ?? 'A row no longer in the budget'} (no longer offered)
            </option>
          )}
          {options?.map((o) => (
            <option key={keyOf(o.field, o.id)} value={keyOf(o.field, o.id)}>
              {'   '.repeat(o.depth)}
              {o.code ? `${o.code} · ` : ''}
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 pl-[168px] text-xs text-slate-400">
        Optional: the budget row this line is bought for.
        {ppmp.kind === 'INDICATIVE' && ' The Final PPMP carries the link over to the enacted budget.'}
      </p>
      {error && <p className="mt-1 pl-[168px] text-xs text-red-600">{error}</p>}
    </div>
  );
}
