'use client';

/**
 * The Records view (W21; specs/020 owner feedback): the rows behind a sheet,
 * 50 a page, from the engine's `/query/rows`. Nothing is added up here, so
 * several years may be listed together.
 *
 * Each row shows its name, office and money (`recordColumns`). An AIP program
 * opens into its projects and activities. Clicking a name opens its details:
 * every field of the city's data, then the explorer's own readings (labels,
 * topics, barangays, words) under their own heading, and a link to its page.
 */
import { Fragment, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { LocaleLink } from '@/components/i18n/locale-link';
import { useT } from '@/i18n/locale-provider';
import { runRows } from '@/app/(public)/explore/_actions';
import type { QueryRows } from '@/lib/api';
import { pesoFull } from '@/lib/explore/compile';
import { cellText, recordColumns, recordHref, type RowsColumn, type RowsRow } from '@/lib/explore/records';
import type { WorkbookQuery } from '@/lib/explore/workbook';

const SIZE = 50;
type Sort = { by: string; dir: 'asc' | 'desc' };
type Child = NonNullable<QueryRows['children']>[string][number];
type Open = { row: RowsRow; children: Child[] } | { child: Child; parent: RowsRow };

export function Records({ query }: { query: WorkbookQuery }) {
  const t = useT();
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Sort | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Open | null>(null);
  const [got, setGot] = useState<{ key: string; rows?: QueryRows; error?: 'limit' | 'failed' } | null>(null);
  // The chart's own sort and top N mean nothing to a list of records.
  const ask = { ...query, limit: undefined, sort: sort ?? undefined, calcs: undefined };
  const key = JSON.stringify([ask, page]);
  useEffect(() => {
    let live = true;
    const [q, p] = JSON.parse(key) as [WorkbookQuery, number];
    runRows(q, p * SIZE).then((r) => live && setGot({ key, ...('rows' in r ? { rows: r.rows } : { error: r.error }) }));
    return () => {
      live = false;
    };
  }, [key]);

  if (!got || got.key !== key) return <p className="canvas-msg">{t('explore.ws.loading')}</p>;
  if (got.error) return <p className="canvas-msg" role="alert">{t(got.error === 'limit' ? 'explore.ask.limit' : 'explore.ask.failed')}</p>;
  const r = got.rows!;
  if (!r.total) return <p className="canvas-msg">{t('explore.teach.empty')}</p>;
  const { name, primary, details, derived } = recordColumns(r.columns, r.rows);
  const cell = (v: RowsRow[string], role: string) => (v === null || v === undefined ? '—' : role === 'money' && typeof v === 'string' ? pesoFull(v) : cellText(v) || '—');
  const flip = (by: string, money: boolean) => {
    setPage(0);
    setSort((s) => (s?.by === by ? { by, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { by, dir: money ? 'desc' : 'asc' }));
  };
  const toggle = (id: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const last = Math.max(0, Math.ceil(r.total / SIZE) - 1);
  const header = (c: RowsColumn) => {
    const on = (sort?.by ?? 'amount') === c.field;
    const dir = sort?.dir ?? 'desc';
    return (
      <th key={c.field} scope="col" className={`rec-${c.field}${c.role === 'money' ? ' r rec-money' : ''}`} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
        <button type="button" className="sortbtn" onClick={() => flip(c.field, c.role === 'money')}>
          {c.label}
          {on && (dir === 'asc' ? <ArrowUp size={12} aria-hidden /> : <ArrowDown size={12} aria-hidden />)}
        </button>
      </th>
    );
  };
  const amountCol = primary.find((c) => c.role === 'money');

  return (
    <div className="records" data-testid="records">
      <div className="records-scroll">
        <table className="gridtbl">
          <thead>
            <tr>
              <th scope="col" className="rec-x" aria-label={t('explore.ws.rec.children')} />
              {name && header(name)}
              {primary.map(header)}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => {
              const id = typeof row.id === 'string' ? row.id : `${i}`;
              const kids = r.children?.[id] ?? [];
              const isOpen = expanded.has(id);
              return (
                <Fragment key={id + i}>
                  <tr>
                    <td className="rec-x">
                      {kids.length > 0 && (
                        <button
                          type="button"
                          className="iconbtn"
                          aria-expanded={isOpen}
                          aria-label={t(isOpen ? 'explore.ws.rec.collapse' : 'explore.ws.rec.expand', { n: kids.length })}
                          title={t(isOpen ? 'explore.ws.rec.collapse' : 'explore.ws.rec.expand', { n: kids.length })}
                          onClick={() => toggle(id)}
                        >
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                    </td>
                    {name && (
                      <td className="rec-name">
                        <button type="button" className="cellbtn" onClick={() => setOpen({ row, children: kids })} title={t('explore.ws.rec.details')}>
                          {cell(row[name.field], 'dimension')}
                        </button>
                      </td>
                    )}
                    {primary.map((c) => (
                      <td key={c.field} className={c.role === 'money' ? 'r' : undefined} title={cell(row[c.field], c.role)}>
                        {cell(row[c.field], c.role)}
                      </td>
                    ))}
                  </tr>
                  {isOpen &&
                    kids.map((k) => (
                      <tr key={k.id} className="rec-child">
                        <td className="rec-x" />
                        <td className="rec-name">
                          <button type="button" className="cellbtn" onClick={() => setOpen({ child: k, parent: row })}>
                            {k.name}
                          </button>
                        </td>
                        {primary.map((c) => (
                          <td key={c.field} className={c.role === 'money' ? 'r' : undefined}>
                            {c === amountCol ? pesoFull(k.amount) : ''}
                          </td>
                        ))}
                      </tr>
                    ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span role="status">{t('explore.ws.recordsOf', { from: (r.offset + 1).toLocaleString('en-PH'), to: (r.offset + r.rows.length).toLocaleString('en-PH'), total: r.total.toLocaleString('en-PH') })}</span>
        <span className="spacer" />
        <button type="button" className="btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
          {t('explore.ws.previous')}
        </button>
        <button type="button" className="btn" disabled={page >= last} onClick={() => setPage((p) => p + 1)}>
          {t('explore.ws.next')}
        </button>
      </div>
      <Details open={open} onClose={() => setOpen(null)} query={query} name={name} details={details} derived={derived} cell={cell} />
    </div>
  );
}

function Details({
  open,
  onClose,
  query,
  name,
  details,
  derived,
  cell,
}: {
  open: Open | null;
  onClose: () => void;
  query: WorkbookQuery;
  name?: RowsColumn;
  details: RowsColumn[];
  derived: RowsColumn[];
  cell: (v: RowsRow[string], role: string) => string;
}) {
  const t = useT();
  const row = open && 'row' in open ? open.row : null;
  const child = open && 'child' in open ? open.child : null;
  const parent = open && 'parent' in open ? open.parent : null;
  const title = child ? child.name : row && name ? cell(row[name.field], 'dimension') : '';
  const amount = child ? child.amount : row && typeof row.amount === 'string' ? row.amount : null;
  const href = child
    ? recordHref({ source: 'aip-activities', documents: query.documents }, { id: child.id, parentId: typeof parent?.id === 'string' ? parent.id : null })
    : row
      ? recordHref(query, row)
      : null;
  const list = (cols: RowsColumn[]) => (
    <dl className="rec-dl">
      {cols.map((c) => (
        <Fragment key={c.field}>
          <dt>{c.label}</dt>
          <dd>{cell(row![c.field], c.role)}</dd>
        </Fragment>
      ))}
    </dl>
  );
  return (
    <Sheet open={!!open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="rec-sheet" data-testid="record-details">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{child ? t('explore.ws.rec.childOf', { program: parent && name ? cell(parent[name.field], 'dimension') : '' }) : t('explore.ws.rec.details')}</SheetDescription>
        </SheetHeader>
        <div className="rec-body">
          {amount && <p className="rec-amount">{pesoFull(amount)}</p>}
          {href && (
            <LocaleLink className="rec-link" href={href} target="_blank">
              {t('explore.ws.rec.open')}
              <ExternalLink size={12} aria-hidden />
            </LocaleLink>
          )}
          {row && list(details)}
          {row && open && 'children' in open && open.children.length > 0 && (
            <section>
              <h3>{t('explore.ws.rec.children')}</h3>
              <ul className="rec-kids">
                {open.children.map((k) => (
                  <li key={k.id}>
                    <span>{k.name}</span>
                    <span className="r">{pesoFull(k.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {row && derived.length > 0 && (
            <section>
              <h3>{t('explore.ws.rec.derived')}</h3>
              <p className="rec-note">{t('explore.ws.rec.derivedNote')}</p>
              {list(derived)}
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
