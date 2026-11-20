'use client';

/**
 * Pieces the sheet canvas and the dashboard tiles share: a sheet's answer
 * (cached per query for the visit), labels, and the result table.
 */
import { useEffect, useState } from 'react';
import { useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import { runQuery } from '@/app/(public)/explore/_actions';
import { pesoFull, type QueryResult, type SourceInfo } from '@/lib/explore/compile';
import type { Picked } from '@/lib/explore/sheets';
import type { WorkbookQuery } from '@/lib/explore/workbook';

export type Res = { status: 'loading' } | { status: 'ok'; result: QueryResult } | { status: 'error'; kind: 'limit' | 'failed' | 'invalid'; errors?: string[] };
export type At = { x: number; y: number };

// ponytail: one cache for the visit, never evicted; a workbook has at most 20 sheets × a few edits.
const cache = new Map<string, Res>();

/** The engine's answer to a query; the same query is asked once per visit. */
export function useResult(query: WorkbookQuery): Res {
  const key = JSON.stringify(query);
  const [got, setGot] = useState<{ key: string; res: Res } | null>(null);
  useEffect(() => {
    if (cache.has(key)) return;
    let live = true;
    runQuery(JSON.parse(key)).then((r) => {
      const v: Res = 'result' in r ? { status: 'ok', result: r.result } : { status: 'error', kind: r.error, errors: r.errors };
      if (v.status === 'ok' || v.kind === 'invalid') cache.set(key, v);
      if (live) setGot({ key, res: v });
    });
    return () => {
      live = false;
    };
  }, [key]);
  return cache.get(key) ?? (got?.key === key ? got.res : LOADING);
}
const LOADING: Res = { status: 'loading' };

export const fieldLabel = (source: SourceInfo, id: string) => source.fields.find((f) => f.id === id)?.label ?? id;

export function measureLabel(t: ReturnType<typeof useT>, source: SourceInfo, m: WorkbookQuery['measures'][number]) {
  if (m.agg === 'count') return t('explore.ws.count');
  const label = fieldLabel(source, m.field);
  if (m.agg === 'perCapita') return t('explore.ws.perResident', { measure: label });
  return m.agg === 'sum' ? label : `${t(`explore.ws.agg.${m.agg}` as MessageKey)} · ${label}`;
}

/** "{measure} by {breakdown}", the sheet's own title. */
export function sheetTitle(t: ReturnType<typeof useT>, source: SourceInfo, q: WorkbookQuery) {
  const measure = measureLabel(t, source, q.measures[0]);
  return q.dimensions.length ? t('explore.ws.title', { measure, dim: fieldLabel(source, q.dimensions[0]) }) : measure;
}

/** Years and documents are chosen in the inspector, never by clicking a mark. */
export const pickable = (q: WorkbookQuery) => q.dimensions.length > 0 && q.dimensions[0] !== 'year' && q.dimensions[0] !== 'kind';

const fmt = (v: string | null, role: string) =>
  v === null ? '—' : role === 'ratio' ? `${(Number(v) * 100).toFixed(1)}%` : role === 'money' ? pesoFull(v) : v;

export function ResultTable({ r, onPick }: { r: QueryResult; onPick?: (p: Picked, at: At) => void }) {
  const t = useT();
  const nd = r.query.dimensions.length;
  const cols = r.columns;
  const canPick = onPick && pickable(r.query);
  return (
    <table className="gridtbl" data-testid="result-table">
      <thead>
        <tr>
          {cols.map((c, i) => (
            <th key={c.field} className={i >= nd ? 'r' : undefined} scope="col">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {r.rows.map((row, i) => (
          <tr key={i}>
            {row.keys.map((k, j) => (
              <td key={j}>
                {j === 0 && canPick && k.code !== null ? (
                  <button
                    type="button"
                    className="cellbtn"
                    aria-haspopup="menu"
                    title={t('explore.ws.pick.hint')}
                    onClick={(e) => {
                      const b = e.currentTarget.getBoundingClientRect();
                      onPick({ field: r.query.dimensions[0], code: k.code!, label: k.label }, { x: b.left, y: b.bottom });
                    }}
                  >
                    {k.label}
                  </button>
                ) : (
                  k.label
                )}
              </td>
            ))}
            {[...row.values, ...row.calcs].map((v, j) => (
              <td key={`v${j}`} className="r">
                {fmt(v, cols[nd + j].role)}
              </td>
            ))}
          </tr>
        ))}
        {r.other && (
          <tr>
            <td colSpan={nd}>{r.other.label}</td>
            {r.other.values.map((v, j) => (
              <td key={j} className="r">
                {fmt(v, cols[nd + j].role)}
              </td>
            ))}
          </tr>
        )}
      </tbody>
    </table>
  );
}
