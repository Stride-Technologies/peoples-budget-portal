'use client';

/**
 * A dashboard (W21): 1–4 of the workbook's sheets side by side. Clicking a
 * mark in one tile selects that value and filters every other tile whose
 * source has the same field (Tableau's filter action); the same click again,
 * or Clear selection, removes it. The selection lives here only: never saved.
 */
import { useState } from 'react';
import { BarChart3, ChevronDown, Table2, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useT } from '@/i18n/locale-provider';
import { lint, markOf, type SourceInfo } from '@/lib/explore/compile';
import type { MessageKey } from '@/i18n/t';
import { linked, type Picked } from '@/lib/explore/sheets';
import { MAX_TILES, type Dashboard, type Sheet, type Workbook } from '@/lib/explore/workbook';
import { ResultTable, sheetTitle, pickable, useResult } from './parts';
import { VegaChart } from './vega-chart';

type Sel = { from: string; p: Picked } | null;

export function DashboardView({
  wb,
  board,
  sources,
  dark,
  commit,
  openSheet,
}: {
  wb: Workbook;
  board: Dashboard;
  sources: SourceInfo[];
  dark: boolean;
  commit: (f: (w: Workbook) => Workbook) => void;
  openSheet: (i: number) => void;
}) {
  const t = useT();
  const [sel, setSel] = useState<Sel>(null);
  const tiles = board.sheets.map((id) => wb.sheets.find((s) => s.id === id)!).filter(Boolean);
  const setTiles = (ids: string[]) =>
    commit((w) => ({ ...w, dashboards: w.dashboards!.map((d) => (d.id === board.id ? { ...d, sheets: ids } : d)) }));
  const toggle = (id: string) => setTiles(board.sheets.includes(id) ? board.sheets.filter((x) => x !== id) : [...board.sheets, id]);
  const pick = (from: string, p: Picked) => setSel((s) => (s?.from === from && s.p.field === p.field && s.p.code === p.code ? null : { from, p }));

  return (
    <section className="board" aria-label={board.name} data-testid="dashboard">
      <div className="board-h">
        <h1 className="canvas-title">{board.name}</h1>
        {sel && (
          <span className="chip chip-sel" role="status">
            {t('explore.ws.board.selected', { value: sel.p.label })}
            <button type="button" className="x" aria-label={t('explore.ws.board.clear')} title={t('explore.ws.board.clear')} onClick={() => setSel(null)}>
              <X size={12} />
            </button>
          </span>
        )}
        <span className="spacer" />
        <DropdownMenu>
          <DropdownMenuTrigger className="btn" data-testid="board-sheets">
            {t('explore.ws.board.sheets', { n: board.sheets.length, max: MAX_TILES })}
            <ChevronDown size={14} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="ws-menu">
            {wb.sheets.map((s) => {
              const on = board.sheets.includes(s.id);
              return (
                <DropdownMenuCheckboxItem key={s.id} checked={on} closeOnClick={false} disabled={on ? board.sheets.length === 1 : board.sheets.length >= MAX_TILES} onCheckedChange={() => toggle(s.id)}>
                  {s.name}
                </DropdownMenuCheckboxItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="canvas-sub">{t('explore.ws.board.hint')}</p>
      <div className={`tiles tiles-${tiles.length}`}>
        {tiles.map((s) => (
          <Tile
            key={s.id}
            sheet={s}
            source={sources.find((x) => x.id === s.query.source) ?? sources[0]}
            sel={sel}
            dark={dark}
            onPick={(p) => pick(s.id, p)}
            onOpen={() => openSheet(wb.sheets.indexOf(s))}
          />
        ))}
      </div>
    </section>
  );
}

function Tile({ sheet, source, sel, dark, onPick, onOpen }: { sheet: Sheet; source: SourceInfo; sel: Sel; dark: boolean; onPick: (p: Picked) => void; onOpen: () => void }) {
  const t = useT();
  const [asTable, setAsTable] = useState(false);
  const other = sel && sel.from !== sheet.id ? sel.p : null;
  const query = linked(sheet.query, other, source.fields);
  const filtered = query !== sheet.query;
  const res = useResult(query);
  const r = res.status === 'ok' ? res.result : null;
  const mark = r ? markOf(sheet.mark, query, r) : null;
  const title = sheetTitle(t, source, sheet.query);
  const canPick = pickable(query);
  const why = r && mark ? lint(mark, r) : null;
  const showTable = asTable || mark === 'table' || !!why;
  const picked = (p: Picked) => canPick && onPick(p);
  return (
    <article className={sel?.from === sheet.id ? 'tile tile-src' : 'tile'} aria-label={sheet.name}>
      <div className="tile-h">
        <button type="button" className="tile-title" title={t('explore.ws.board.open')} onClick={onOpen}>
          {sheet.name}
        </button>
        {filtered && <span className="chip">{t('explore.ws.board.filteredBy', { value: other!.label })}</span>}
        {other && !filtered && <span className="chip chip-muted">{t('explore.ws.board.notLinked')}</span>}
        <span className="spacer" />
        <button type="button" className="iconbtn" aria-pressed={showTable} aria-label={t(showTable ? 'explore.ws.chartView' : 'explore.ws.tableView')} title={t(showTable ? 'explore.ws.chartView' : 'explore.ws.tableView')} disabled={mark === 'table' || !!why} onClick={() => setAsTable((x) => !x)}>
          {showTable ? <BarChart3 size={14} /> : <Table2 size={14} />}
        </button>
      </div>
      {why && <p className="canvas-note" role="note">{t('explore.lint.shownAsTable', { reason: t(`explore.lint.${why}` as MessageKey) })}</p>}
      <div className="tile-body" style={{ overflow: showTable ? 'auto' : 'hidden' }}>
        {res.status === 'loading' && <p className="canvas-msg">{t('explore.ws.loading')}</p>}
        {res.status === 'error' && <p className="canvas-msg" role="alert">{t(res.kind === 'limit' ? 'explore.ask.limit' : res.kind === 'invalid' ? 'explore.ws.tileInvalid' : 'explore.ask.failed')}</p>}
        {r && !r.rows.length && <p className="canvas-msg">{t('explore.ws.empty')}</p>}
        {r && r.rows.length > 0 &&
          (showTable ? (
            <ResultTable r={r} onPick={(p) => picked(p)} />
          ) : (
            <VegaChart
              mark={mark!}
              result={r}
              dark={dark}
              svgId={`ws-tile-${sheet.id}`}
              label={`${sheet.name}: ${title}`}
              onPick={(d) => picked({ field: query.dimensions[0], code: d.k0!, label: d.l0 ?? d.y })}
            />
          ))}
      </div>
    </article>
  );
}
