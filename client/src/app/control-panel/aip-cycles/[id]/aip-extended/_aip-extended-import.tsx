'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { ChevronsUpDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn, matchesAllTerms } from '@/lib/utils';
import { formatPeso } from '@/lib/currency-formatter';
import type {
  AipExtendedApplyResult,
  AipExtendedEntry,
  AipExtendedPreview,
  AipExtendedPreviewRow,
} from '@/lib/api';
import { applyAipExtended, previewAipExtended } from '../../_actions';

const FIELD_LABEL: Record<string, string> = {
  expectedOutput: 'Performance indicator',
  targetForBudgetYear: 'Target',
  sdgGoals: 'SDG goals',
};

/** The sheet's code with every segment that differs from the entry's marked. */
function CodeDiff({ code, against }: { code: string; against?: string }) {
  const other = against?.split('-');
  return (
    <span className="font-mono">
      {code.split('-').map((seg, i) => (
        <span key={i}>
          {i > 0 && '-'}
          <span
            className={cn(
              other && other[i] !== seg && 'rounded bg-amber-100 px-0.5 text-amber-900',
            )}
          >
            {seg}
          </span>
        </span>
      ))}
    </span>
  );
}

const same = (a: string | null, b: string) =>
  (a ?? '').replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();

/** What applying `row` to `entry` would do, mirroring the API's fill-blanks rule. */
function outcome(row: AipExtendedPreviewRow, entry: AipExtendedEntry) {
  const field = (portal: string | null, sheet: string) =>
    !sheet ? 'blank in sheet' : !portal?.trim() ? 'fills' : same(portal, sheet) ? 'same' : 'kept';
  return {
    indicator: field(entry.expectedOutput, row.indicator),
    target: field(entry.targetForBudgetYear, row.target),
    sdg: row.sdgCodes.filter((c) => !entry.sdgCodes.includes(c)),
  };
}

const OUTCOME_TEXT: Record<string, string> = {
  fills: 'will be filled',
  same: 'already the same',
  kept: 'differs — portal value kept',
  'blank in sheet': 'blank in the sheet',
};

function EntryPicker({
  entries,
  suggested,
  officeAcronyms,
  value,
  takenBy,
  onChange,
  label,
}: {
  entries: AipExtendedEntry[];
  suggested: string[];
  officeAcronyms: Set<string>;
  value: string;
  takenBy: Map<string, number>;
  onChange: (id: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = entries.find((e) => e.id === value);
  const groups = useMemo(() => {
    const first = entries.filter((e) => suggested.includes(e.id));
    const office = entries.filter(
      (e) => !suggested.includes(e.id) && officeAcronyms.has(e.officeAcronym ?? ''),
    );
    const rest = entries.filter(
      (e) => !suggested.includes(e.id) && !officeAcronyms.has(e.officeAcronym ?? ''),
    );
    return [
      ['Suggested', first],
      [`This office (${[...officeAcronyms].join(', ') || '—'})`, office],
      ['Other offices', rest],
    ] as const;
  }, [entries, suggested, officeAcronyms]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className="flex h-10 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg border border-input bg-white px-3 text-left text-sm"
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? `${selected.code} — ${selected.name}` : 'Choose the AIP entry…'}
        </span>
        <ChevronsUpDown className="ml-auto size-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[min(40rem,90vw)] p-0" side="bottom" align="start" sideOffset={4}>
        <Command filter={(v, search) => (matchesAllTerms(v, search) ? 1 : 0)}>
          <CommandInput placeholder="Search code, office or name…" />
          <CommandList className="max-h-80">
            <CommandEmpty>No AIP entry found.</CommandEmpty>
            {groups.map(([heading, list]) =>
              list.length ? (
                <CommandGroup key={heading} heading={heading}>
                  {list.map((e) => {
                    const taken = takenBy.get(e.id);
                    return (
                      <CommandItem
                        key={e.id}
                        value={`${e.code} ${e.officeAcronym ?? ''} ${e.name}`}
                        disabled={taken !== undefined && e.id !== value}
                        data-checked={e.id === value}
                        onSelect={() => {
                          onChange(e.id);
                          setOpen(false);
                        }}
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="font-mono text-xs">
                            {e.code} · {e.officeAcronym}
                            {taken !== undefined && e.id !== value && ` · used by row ${taken}`}
                          </span>
                          <span className="truncate">{e.name}</span>
                        </span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function EntryCard({ row, entry }: { row: AipExtendedPreviewRow; entry: AipExtendedEntry }) {
  const o = outcome(row, entry);
  return (
    <div className="mt-2 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-neutral-700">
          {entry.code}
          {!entry.aipReferenceCode && <span className="ml-1 text-neutral-400">(tentative)</span>}
        </p>
        <Link
          href={`/programs/${entry.id}/edit`}
          target="_blank"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          Open in AIP <ExternalLink className="size-3" />
        </Link>
      </div>
      <p className="mt-1 text-sm font-medium text-neutral-900">{entry.name}</p>
      <p className="text-neutral-500">
        {entry.officeAcronym} · {entry.status.replaceAll('_', ' ').toLowerCase()} ·{' '}
        <span className="tabular-nums">{formatPeso(entry.proposedTotal)}</span>
        {entry.majorFinalOutput && <> · MFO: {entry.majorFinalOutput}</>}
      </p>
      <dl className="mt-2 grid gap-1 sm:grid-cols-[9rem_1fr]">
        <dt className="text-neutral-500">Indicator now</dt>
        <dd>
          {entry.expectedOutput || <span className="text-neutral-400">blank</span>}{' '}
          <span className="text-neutral-500">— {OUTCOME_TEXT[o.indicator]}</span>
        </dd>
        <dt className="text-neutral-500">Target now</dt>
        <dd>
          {entry.targetForBudgetYear || <span className="text-neutral-400">blank</span>}{' '}
          <span className="text-neutral-500">— {OUTCOME_TEXT[o.target]}</span>
        </dd>
        <dt className="text-neutral-500">SDG goals now</dt>
        <dd>
          {entry.sdgCodes.join(', ') || <span className="text-neutral-400">none</span>}
          {o.sdg.length > 0 && <span className="text-neutral-500"> — adds {o.sdg.join(', ')}</span>}
        </dd>
      </dl>
    </div>
  );
}

const MATCH_BADGE: Record<AipExtendedPreviewRow['match'], [string, string]> = {
  exact: ['Code found in the AIP', 'bg-green-100 text-green-800'],
  ambiguous: ['Code on several entries', 'bg-amber-100 text-amber-800'],
  none: ['Code not in the AIP', 'bg-red-100 text-red-700'],
};

/**
 * Upload one office's AIP-Extended sheet, match each row to its AIP entry, and
 * fill blank indicators, targets and SDG links (specs/008 US3). The sheet's
 * codes should be the AIP's own; where they are not, the staff member picks
 * the entry here, with the entry's current values in view.
 */
export function AipExtendedImport({ cycleId }: { cycleId: string }) {
  const [preview, setPreview] = useState<AipExtendedPreview | null>(null);
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [result, setResult] = useState<AipExtendedApplyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const byId = useMemo(
    () => new Map((preview?.entries ?? []).map((e) => [e.id, e])),
    [preview],
  );
  const officeAcronyms = useMemo(() => {
    const ids = (preview?.rows ?? []).flatMap((r) => [...r.matchIds, ...r.suggestionIds]);
    return new Set(ids.map((id) => byId.get(id)?.officeAcronym ?? '').filter(Boolean));
  }, [preview, byId]);
  const takenBy = useMemo(
    () => new Map(Object.entries(choice).filter(([, id]) => id).map(([row, id]) => [id, Number(row)])),
    [choice],
  );

  const read = (formData: FormData) => {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await previewAipExtended(cycleId, formData);
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setPreview(res.preview);
      // An exact, unique, unrepeated code is the entry; everything else waits for a person.
      setChoice(
        Object.fromEntries(
          res.preview.rows.map((r) => [
            r.row,
            r.match === 'exact' && !r.duplicate ? r.matchIds[0] : '',
          ]),
        ),
      );
    });
  };

  const chosen = (preview?.rows ?? []).filter((r) => choice[r.row]);
  const apply = () => {
    if (!preview) return;
    setError(null);
    startTransition(async () => {
      const res = await applyAipExtended(cycleId, {
        fileName: preview.fileName,
        rows: chosen.map((r) => ({
          programId: choice[r.row],
          sheetRow: r.row,
          aipCode: r.aipCode,
          indicator: r.indicator,
          target: r.target,
          sdgCodes: r.sdgCodes,
        })),
      });
      if ('error' in res) setError(res.error);
      else {
        setResult(res.result);
        setPreview(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <form action={read} className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          name="file"
          accept=".xlsx"
          aria-label="Office workbook"
          className="max-w-sm"
          required
        />
        <Button type="submit" variant="outline" disabled={isPending}>
          {isPending && !preview ? 'Reading…' : 'Read sheet'}
        </Button>
      </form>

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {result && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm" role="status">
          <p className="font-medium text-green-900">
            Filled {result.filled.length} AIP entr{result.filled.length === 1 ? 'y' : 'ies'};{' '}
            {result.unchanged} had nothing blank to fill.
          </p>
          {result.filled.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-green-900">
              {result.filled.map((f) => (
                <li key={f.programId}>
                  <span className="font-mono">{f.code}</span>:{' '}
                  {f.fields.map((k) => FIELD_LABEL[k] ?? k).join(', ')}
                </li>
              ))}
            </ul>
          )}
          {result.conflicts.length > 0 && (
            <>
              <p className="mt-3 font-medium text-amber-900">
                Kept the portal&apos;s value where the sheet differs ({result.conflicts.length}):
              </p>
              <ul className="mt-1 list-disc pl-5 text-amber-900">
                {result.conflicts.map((c, i) => (
                  <li key={i}>
                    Row {c.sheetRow} → <span className="font-mono">{c.code}</span>{' '}
                    {FIELD_LABEL[c.field] ?? c.field}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {preview && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm">
            <p className="text-neutral-700">
              <span className="font-medium">{preview.fileName}</span> · {preview.sheet} ·{' '}
              {preview.rows.length} coded row{preview.rows.length === 1 ? '' : 's'} ·{' '}
              {preview.rows.filter((r) => r.match === 'exact').length} found by code ·{' '}
              {chosen.length} ready to fill
            </p>
            <Button onClick={apply} disabled={isPending || chosen.length === 0}>
              {isPending ? 'Filling…' : `Fill ${chosen.length} AIP entr${chosen.length === 1 ? 'y' : 'ies'}`}
            </Button>
          </div>

          {preview.rows.length === 0 && (
            <p className="text-sm text-neutral-500">The sheet has no coded rows.</p>
          )}

          <ol className="space-y-3">
            {preview.rows.map((r) => {
              const entry = byId.get(choice[r.row] ?? '');
              const [badge, badgeClass] = MATCH_BADGE[r.match];
              const suggested = r.match === 'exact' ? [] : [...r.matchIds, ...r.suggestionIds];
              return (
                <li key={r.row} className="rounded-lg border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">Row {r.row}</span>
                    <CodeDiff code={r.aipCode} against={entry?.code} />
                    <span className={cn('rounded px-1.5 py-0.5 font-medium', badgeClass)}>{badge}</span>
                    {r.duplicate && (
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800">
                        Code repeated in the sheet
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium text-neutral-900">{r.description || '—'}</p>
                  <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[9rem_1fr]">
                    <dt className="text-neutral-500">Sheet indicator</dt>
                    <dd>{r.indicator || <span className="text-neutral-400">blank</span>}</dd>
                    <dt className="text-neutral-500">Sheet target</dt>
                    <dd>{r.target || <span className="text-neutral-400">blank</span>}</dd>
                    <dt className="text-neutral-500">Sheet SDG goals</dt>
                    <dd>
                      {r.sdgCodes.join(', ') || <span className="text-neutral-400">none</span>}
                      {r.unknownSdgCodes.length > 0 && (
                        <span className="text-amber-700"> (not in the catalog: {r.unknownSdgCodes.join(', ')})</span>
                      )}
                    </dd>
                  </dl>

                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <EntryPicker
                        label={`AIP entry for row ${r.row}`}
                        entries={preview.entries}
                        suggested={suggested}
                        officeAcronyms={officeAcronyms}
                        value={choice[r.row] ?? ''}
                        takenBy={takenBy}
                        onChange={(id) => setChoice((c) => ({ ...c, [r.row]: id }))}
                      />
                    </div>
                    {entry && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setChoice((c) => ({ ...c, [r.row]: '' }))}
                      >
                        Skip row
                      </Button>
                    )}
                  </div>
                  {!entry && suggested.length > 0 && (
                    <div className="mt-2 space-y-1 text-xs">
                      <p className="text-amber-800">
                        {r.match === 'ambiguous'
                          ? 'Several entries carry this code — check the names:'
                          : 'Same code except the office type — check the name matches before using it:'}
                      </p>
                      {suggested.map((id) => {
                        const s = byId.get(id);
                        if (!s) return null;
                        return (
                          <div key={id} className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={takenBy.has(id)}
                              onClick={() => setChoice((c) => ({ ...c, [r.row]: id }))}
                            >
                              Use
                            </Button>
                            <span className="min-w-0 truncate">
                              <span className="font-mono">{s.code}</span> — {s.name}
                              {takenBy.has(id) && ` (used by row ${takenBy.get(id)})`}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {entry && <EntryCard row={r} entry={entry} />}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
