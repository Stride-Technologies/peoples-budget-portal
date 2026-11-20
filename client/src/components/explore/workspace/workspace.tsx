'use client';

/**
 * The desktop Data Explorer (specs/018 redesign P3 + the P4 shell, layout C):
 * inspector left, shelves as a sentence over the canvas, chat right, sheet
 * tabs below. The page never scrolls; panels do. State is one workbook
 * (`lib/explore/workbook.ts`): each sheet a query and a mark, the shelves a
 * view on the query. Saved in this browser; Share stores a snapshot.
 * Design: specs/018-data-explorer/redesign-p3-workbook.md.
 */
import './workspace.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  ChevronDown,
  Database,
  FilePlus2,
  HelpCircle,
  LayoutGrid,
  Layers,
  ListTree,
  Link2,
  MessageCircle,
  Moon,
  Plus,
  Redo2,
  Sun,
  Table2,
  Undo2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LocaleLink } from '@/components/i18n/locale-link';
import { useLocale, useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import { localizedPath } from '@/i18n/locales';
import { saveSnapshot } from '@/app/(public)/explore/_actions';
import { download, inlineFonts, pngFromMarkup, svgMarkup } from '@/components/explore/share-menu';
import { allowedMarks, chartData, formatValue, lint, markOf, resultCsv, unitOf, type SourceInfo } from '@/lib/explore/compile';
import { frameSvg, queryHash } from '@/lib/explore/export-frame';
import { blankQuery, defaultWorkbook, drillField, fitQuery, isBlank, narrow, newId, newSheet, STORAGE_KEY, viewToQuery, type Picked } from '@/lib/explore/sheets';
import { starters as makeStarters, type Starter } from '@/lib/explore/starters';
import { decodeView, type Capabilities, type Catalogue } from '@/lib/explore/view-url';
import { checkWorkbook, MARKS, MAX_DASHBOARDS, MAX_TILES, type Mark, type Sheet, type Workbook, type WorkbookQuery } from '@/lib/explore/workbook';
import { ChatColumn } from './chat-column';
import { Guide, StarterList, type GuideTab } from './guide';
import { DashboardView } from './dashboard';
import { fieldLabel, measureLabel, pickable, ResultTable, sheetTitle, useResult, type At, type Res } from './parts';
import { PickMenu, type PickAction } from './pick-menu';
import { Records } from './records';
import { readTheme, VegaChart } from './vega-chart';

type Field = SourceInfo['fields'][number];
/** What a field dragged from the list carries: its id under a type that says what it is. */
const DRAG = { dimension: 'application/x-ws-dimension', money: 'application/x-ws-money' } as const;

/**
 * The workbook with no dashboard on screen. Editing a sheet, or opening one, leaves the
 * dashboard: the shelves and canvas belong to the sheet. (Dashboards themselves are kept.)
 */
function withoutBoard(w: Workbook): Workbook {
  const { board: _b, ...rest } = w;
  void _b;
  return rest;
}

const CALCS = ['percentOfTotal', 'differenceFromPrevious', 'percentDifferenceFromPrevious', 'rank', 'runningTotal'] as const;
const AGGS = ['sum', 'avg', 'min', 'max'] as const;
const TOPS = [5, 10, 20, 50] as const;
const SVG_ID = 'ws-chart-svg';

const store = {
  read(): Workbook | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (checkWorkbook(JSON.parse(raw)).workbook ?? null) : null;
    } catch {
      return null;
    }
  },
  probe(): boolean {
    try {
      localStorage.setItem('explorer-probe', '1');
      localStorage.removeItem('explorer-probe');
      return true;
    } catch {
      return false;
    }
  },
  write(wb: Workbook): boolean {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(wb));
      return true;
    } catch {
      return false;
    }
  },
};

function useTheme() {
  const [pick, setPick] = useState<'auto' | 'light' | 'dark'>(() => {
    try {
      const v = localStorage.getItem('explorer-theme');
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch {
      return 'auto';
    }
  });
  const [osDark, setOsDark] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches);
  useLayoutEffect(() => {
    document.documentElement.setAttribute('data-ws', pick);
    return () => document.documentElement.removeAttribute('data-ws');
  }, [pick]);
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)');
    const f = () => setOsDark(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  const dark = pick === 'auto' ? osDark : pick === 'dark';
  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    setPick(next);
    try {
      localStorage.setItem('explorer-theme', next);
    } catch {
      /* remembered for this visit only */
    }
  };
  return { dark, toggle };
}

export function Workspace({
  catalogue,
  sources,
  capabilities,
  incoming,
}: {
  catalogue: Catalogue;
  sources: SourceInfo[];
  capabilities: Capabilities | null;
  /** A shared workbook (`/explore/w/<id>`), opened as a copy. */
  incoming?: Workbook;
}) {
  const t = useT();
  const locale = useLocale();
  const { dark, toggle } = useTheme();
  const names = useMemo(() => ({ workbook: t('explore.ws.defaultWorkbook'), sheet: t('explore.ws.sheet', { n: 1 }) }), [t]);
  const fresh = useCallback(() => defaultWorkbook(catalogue.documents, names), [catalogue.documents, names]);

  // ---- workbook + undo/redo -------------------------------------------------
  // What this browser held when the workspace opened, and whether it keeps anything at all
  // (a private window may not): read and probed once.
  const [boot] = useState(() => {
    const stored = store.read();
    // Probe with a key of its own: this runs during render, and a render React throws
    // away must not leave a workbook behind for the next mount to find.
    return { wb: stored ?? fresh(), hadWorkbook: !!stored, canSave: store.probe() };
  });
  const [hist, setHist] = useState(() => ({ wb: boot.wb, past: [] as Workbook[], future: [] as Workbook[] }));
  const wb = hist.wb;
  const wbRef = useRef(wb);
  useLayoutEffect(() => {
    wbRef.current = wb;
  }, [wb]);
  const commit = useCallback(
    (next: Workbook | ((w: Workbook) => Workbook)) =>
      setHist((h) => {
        const n = typeof next === 'function' ? next(h.wb) : next;
        return n === h.wb ? h : { wb: n, past: [...h.past.slice(-49), h.wb], future: [] };
      }),
    [],
  );
  const undo = useCallback(() => setHist((h) => (h.past.length ? { wb: h.past.at(-1)!, past: h.past.slice(0, -1), future: [h.wb, ...h.future] } : h)), []);
  const redo = useCallback(() => setHist((h) => (h.future.length ? { wb: h.future[0], past: [...h.past, h.wb], future: h.future.slice(1) } : h)), []);
  const saved = boot.canSave;
  useEffect(() => void store.write(wb), [wb]);

  const sheet = wb.sheets[wb.active];
  const source = sources.find((s) => s.id === sheet.query.source) ?? sources[0];
  const patchSheet = useCallback(
    (patch: Partial<Sheet>) =>
      // `w` is the latest workbook, so `w.active` is the sheet on screen when the edit lands.
      commit((w) => ({ ...withoutBoard(w), sheets: w.sheets.map((s, i) => (i === w.active ? { ...s, ...patch } : s)) })),
    [commit],
  );
  const board = wb.board ? wb.dashboards?.find((d) => d.id === wb.board) : undefined;
  const setQuery = (q: WorkbookQuery, src = source) => patchSheet({ query: fitQuery(q, src.fields) });

  // A shared link or an old `?v=1` link is read once into the workbook, then the URL is /explore.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    const here = localizedPath(locale, '/explore');
    // Saved before the address changes: the router may re-mount the workspace on
    // /explore before the autosave effect runs, and it then reads this browser's copy.
    const open = (next: Workbook) => {
      store.write(next);
      commit(next);
    };
    if (incoming) {
      if (!boot.hadWorkbook || window.confirm(t('explore.ws.replaceConfirm'))) open(incoming);
      history.replaceState(null, '', here);
      return;
    }
    const params = new URLSearchParams(location.search);
    const view = params.get('v') === '1' ? decodeView(params) : null;
    if (view) {
      const { query, mark } = viewToQuery(view);
      const src = sources.find((s) => s.id === query.source);
      const w = wbRef.current;
      if (src && w.sheets.length < 20)
        open({ ...w, sheets: [...w.sheets, newSheet(t('explore.ws.fromLink'), fitQuery(query, src.fields), mark)], active: w.sheets.length });
      history.replaceState(null, '', here);
    }
  }, [incoming, commit, locale, sources, t, boot.hadWorkbook]);

  // ---- the active sheet's answer -------------------------------------------
  const res = useResult(sheet.query);

  // ---- keyboard -------------------------------------------------------------
  const [helpOpen, setHelpOpen] = useState(false);
  const [guideTab, setGuideTab] = useState<GuideTab>('guide');
  const openGuide = (tab: GuideTab) => {
    setGuideTab(tab);
    setHelpOpen(true);
  };
  const starters = useMemo(() => makeStarters(catalogue.documents, (k, v) => t(k as MessageKey, v)), [catalogue.documents, t]);
  // A starter replaces the workbook (one undo step), each sheet refitted to its source.
  const openStarter = (s: Starter) => {
    const fit = (sh: Sheet) => ({ ...sh, query: fitQuery(sh.query, (sources.find((x) => x.id === sh.query.source) ?? source).fields) });
    commit({ ...s.workbook, sheets: s.workbook.sheets.map(fit) });
    setHelpOpen(false);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (e.key === '?' && !typing) setHelpOpen((o) => !o);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ---- share ----------------------------------------------------------------
  const [shareNote, setShareNote] = useState<MessageKey | null>(null);
  // The link to this exact workbook: a stored snapshot (the link *is* the saved chart).
  const snapshotUrl = async () => {
    const r = await saveSnapshot(wbRef.current);
    return 'error' in r ? null : `${location.origin}${localizedPath(locale, `/explore/w/${r.id}`)}`;
  };
  async function copyLink() {
    const url = await snapshotUrl();
    if (!url) return setShareNote('explore.ws.linkFailed');
    try {
      await navigator.clipboard.writeText(url);
      setShareNote('explore.ws.linkCopied');
    } catch {
      window.prompt(t('explore.ws.copyLink'), url);
    }
    setTimeout(() => setShareNote(null), 4000);
  }
  const fileBase = sheet.name.replace(/[^\w-]+/g, '-').toLowerCase() || 'chart';
  // A downloaded picture can be checked (specs/020 A1.6): title, subtitle, numbered legend,
  // sources, date, the portal's mark, the view link and a query hash, in the screen's fonts.
  const picture = async () => {
    const inner = svgMarkup(SVG_ID);
    const svg = document.getElementById(SVG_ID);
    if (!inner || !(svg instanceof SVGSVGElement) || res.status !== 'ok') return null;
    const { width, height } = svg.viewBox.baseVal;
    const css = getComputedStyle(document.documentElement);
    const c = (n: string) => css.getPropertyValue(n).trim();
    const theme = readTheme();
    const r = res.result;
    const drawn = markOf(sheet.mark, sheet.query, r);
    const keyed = drawn !== 'heatmap' && drawn !== 'treemap' && drawn !== 'kpi';
    const cd = chartData(r, theme);
    const legend = keyed && (cd.series.length > 1 || cd.drafts)
      ? cd.series.map((s) => ({ label: s, colour: cd.data.find((d) => d.s === s)!.stroke, draft: cd.data.some((d) => d.s === s && d.draft) }))
      : [];
    const [link, hash, fontCss] = await Promise.all([snapshotUrl(), queryHash(sheet.query), inlineFonts([theme.font, theme.display ?? ''])]);
    return frameSvg({
      inner,
      width,
      height,
      title: document.querySelector('.ws .canvas-title')?.textContent ?? sheet.name,
      subtitle: document.querySelector('.ws .canvas-sub')?.textContent ?? '',
      legend,
      sources: t('explore.ws.export.sources', { docs: r.documents.map((d) => d.label).join('; ') }),
      made: t('explore.ws.export.made', { date: new Date().toLocaleDateString('en-PH', { day: 'numeric', month: 'long', year: 'numeric' }) }),
      portal: t('explore.ws.export.mark'),
      link: link ?? location.href,
      hash: t('explore.ws.export.query', { hash }),
      fontCss,
      font: theme.font,
      display: theme.display ?? theme.font,
      colours: { paper: c('--chart-surface'), ink: c('--ink'), muted: c('--ink-muted'), rule: c('--chart-grid') },
    });
  };
  const csv = () => res.status === 'ok' && download(`${fileBase}.csv`, new Blob([resultCsv(res.result)], { type: 'text/csv' }));
  const svgFile = async () => {
    const m = await picture();
    if (m) download(`${fileBase}.svg`, new Blob([m], { type: 'image/svg+xml' }));
  };

  // ---- chat -----------------------------------------------------------------
  const [chatOpen, setChatOpen] = useState(true);
  // A chat answer shows its chart; "See all" opens the records it counted.
  // The canvas remounts on either, starting in that view.
  const [canvasAsk, setCanvasAsk] = useState<{ n: number; view: 'chart' | 'records' }>({ n: 0, view: 'chart' });
  // An answer changes the sheet it was asked from (each sheet has its own chat) and opens it.
  const onQuery = (query: WorkbookQuery, mark: Mark, sheetId: string) => {
    const before = wbRef.current;
    const asked = before.sheets.find((s) => s.id === sheetId);
    if (!asked) return undefined;
    const src = sources.find((s) => s.id === query.source) ?? source;
    commit((w) => {
      const k = w.sheets.findIndex((s) => s.id === sheetId);
      if (k < 0) return w;
      return { ...withoutBoard(w), active: k, sheets: w.sheets.map((s, j) => (j === k ? { ...s, query: fitQuery(query, src.fields), mark } : s)) };
    });
    setCanvasAsk((c) => ({ n: c.n + 1, view: 'chart' }));
    return { sheet: asked.name, undo: () => commit(before) };
  };

  return (
    <div className="ws" data-testid="workspace">
      <header className="topbar">
        <LocaleLink className="brand" href="/explore">
          <span className="brand-mark">N</span>
          <span className="brand-name">{t('explore.ws.brand')}</span>
        </LocaleLink>
        <input
          className="wb-input"
          aria-label={t('explore.ws.workbookName')}
          defaultValue={wb.name}
          key={wb.name}
          maxLength={60}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== wb.name) commit((w) => ({ ...w, name: v }));
            else e.target.value = wb.name;
          }}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <span className="saved" role="status">{t(saved ? 'explore.ws.saved' : 'explore.ws.notSaved')}</span>
        <span className="vsep" />
        <IconButton label={`${t('explore.ws.undo')} (Ctrl+Z)`} onClick={undo} disabled={!hist.past.length}>
          <Undo2 size={16} />
        </IconButton>
        <IconButton label={`${t('explore.ws.redo')} (Ctrl+Shift+Z)`} onClick={redo} disabled={!hist.future.length}>
          <Redo2 size={16} />
        </IconButton>
        <IconButton label={t('explore.ws.newWorkbook')} onClick={() => commit(fresh())}>
          <FilePlus2 size={16} />
        </IconButton>
        <span className="spacer" />
        {shareNote && <span className="saved" role="status">{t(shareNote)}</span>}
        <DropdownMenu>
          <DropdownMenuTrigger className="btn btn-primary">
            <Link2 size={16} aria-hidden />
            {t('explore.ws.share')}
            <ChevronDown size={14} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="ws-menu">
            <DropdownMenuItem onClick={() => void copyLink()}>{t('explore.ws.copyLink')}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={async () => { const m = await picture(); if (m) pngFromMarkup(m, fileBase); }}>{t('explore.share.png')}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void svgFile()}>{t('explore.share.svg')}</DropdownMenuItem>
            <DropdownMenuItem onClick={csv}>{t('explore.share.csv')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="vsep" />
        {!chatOpen && (
          <button type="button" className="btn" onClick={() => setChatOpen(true)}>
            <MessageCircle size={16} aria-hidden />
            {t('explore.ws.showChat')}
          </button>
        )}
        <IconButton label={`${t('explore.ws.help')} (?)`} onClick={() => openGuide('guide')}>
          <HelpCircle size={16} />
        </IconButton>
        <Guide open={helpOpen} onOpenChange={setHelpOpen} tab={guideTab} setTab={setGuideTab} catalogue={catalogue} sources={sources} starters={starters} onOpenStarter={openStarter} />
        <IconButton label={t(dark ? 'explore.ws.themeLight' : 'explore.ws.themeDark')} onClick={toggle}>
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </header>

      <div className={chatOpen ? 'main' : 'main no-chat'}>
        <Inspector catalogue={catalogue} sources={sources} source={source} sheet={sheet} setQuery={setQuery} setMark={(mark) => patchSheet({ mark })} res={res} />

        <main className="center">
          {board ? (
            <DashboardView wb={wb} board={board} sources={sources} dark={dark} commit={commit} openSheet={(i) => commit((w) => ({ ...withoutBoard(w), active: i }))} />
          ) : (
            <>
              <Sentence catalogue={catalogue} source={source} query={sheet.query} setQuery={setQuery} />
              <Canvas key={`${sheet.id}:${canvasAsk.n}`} initialView={canvasAsk.view} catalogue={catalogue} sheet={sheet} source={source} res={res} dark={dark} setQuery={setQuery} teach={{ starters, openStarter, openGuide }} />
            </>
          )}
          <Tabs wb={wb} commit={commit} />
        </main>

        <ChatColumn
          hidden={!chatOpen}
          sheetId={sheet.id}
          sheetName={sheet.name}
          micSeconds={capabilities?.stt.enabled ? capabilities.stt.maxSeconds : undefined}
          training={!!capabilities?.trainingCapture}
          // A blank sheet is nothing to follow up on: the chat answers afresh and picks
          // its own breakdown, or it keeps the blank sheet's none (P7).
          sheet={board || isBlank(sheet.query) ? null : { query: sheet.query, mark: sheet.mark }}
          onQuery={onQuery}
          onRecords={() => {
            if (board) commit((w) => withoutBoard(w));
            setCanvasAsk((c) => ({ n: c.n + 1, view: 'records' }));
          }}
          onHide={() => setChatOpen(false)}
        />
      </div>
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" className="iconbtn" aria-label={label} title={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}


// ---- drag and drop (W21) ------------------------------------------------------------
// The browser's own drag events. Every drop has a click or menu that does the same, which is
// the keyboard and screen-reader path.

const drag = (kind: keyof typeof DRAG, id: string) => (e: React.DragEvent) => {
  e.dataTransfer.setData(DRAG[kind], id);
  e.dataTransfer.effectAllowed = 'copy';
};

function dropOn(kind: keyof typeof DRAG, on: (id: string) => void) {
  const accepts = (e: React.DragEvent) => e.dataTransfer.types.includes(DRAG[kind]);
  return {
    onDragOver: (e: React.DragEvent<HTMLElement>) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      e.currentTarget.dataset.over = '1';
    },
    onDragLeave: (e: React.DragEvent<HTMLElement>) => void delete e.currentTarget.dataset.over,
    onDrop: (e: React.DragEvent<HTMLElement>) => {
      delete e.currentTarget.dataset.over;
      if (!accepts(e)) return;
      e.preventDefault();
      on(e.dataTransfer.getData(DRAG[kind]));
    },
  };
}

// ---- inspector ---------------------------------------------------------------

function Inspector({
  catalogue,
  sources,
  source,
  sheet,
  setQuery,
  setMark,
  res,
}: {
  catalogue: Catalogue;
  sources: SourceInfo[];
  source: SourceInfo;
  sheet: Sheet;
  setQuery: (q: WorkbookQuery, src?: SourceInfo) => void;
  setMark: (m: Mark) => void;
  res: Res;
}) {
  const t = useT();
  const q = sheet.query;
  const docs = catalogue.documents.filter((d) => source.kinds.includes(d.kind));
  const docOn = (kind: string, year: number) => q.documents.some((d) => d.kind === kind && d.years.includes(year));

  const toggleDoc = (kind: string, year: number) => {
    const on = docOn(kind, year);
    const next = catalogue.documents
      .filter((d) => (d.kind === kind && d.year === year ? !on : docOn(d.kind, d.year)))
      .reduce<WorkbookQuery['documents']>((acc, d) => {
        const g = acc.find((x) => x.kind === d.kind);
        if (g) g.years.push(d.year);
        else acc.push({ kind: d.kind, years: [d.year] });
        return acc;
      }, []);
    if (next.length) setQuery({ ...q, documents: next });
  };

  const switchSource = (id: string) => {
    const src = sources.find((s) => s.id === id)!;
    let documents = q.documents.filter((d) => src.kinds.includes(d.kind));
    if (!documents.length) {
      const latest = catalogue.documents.filter((d) => src.kinds.includes(d.kind)).sort((a, b) => b.year - a.year)[0];
      documents = latest ? [{ kind: latest.kind, years: [latest.year] }] : [];
    }
    setQuery({ ...q, source: id, documents }, src);
  };

  const use = (f: Field): string | null => {
    const i = q.dimensions.indexOf(f.id);
    if (i >= 0) return t((['explore.ws.slot.rows', 'explore.ws.slot.colour', 'explore.ws.slot.detail'] as const)[i]);
    if (q.measures.some((m) => m.field === f.id && m.agg !== 'count')) return t('explore.ws.slot.columns');
    if (q.filters.some((x) => x.field === f.id)) return t('explore.ws.slot.filters');
    return null;
  };
  const toggleDim = (f: Field) => {
    if (q.dimensions.includes(f.id)) setQuery({ ...q, dimensions: q.dimensions.filter((d) => d !== f.id) });
    else if (q.dimensions.length < 3) setQuery({ ...q, dimensions: [...q.dimensions, f.id] });
  };
  const toggleMeasure = (m: WorkbookQuery['measures'][number]) => {
    const i = q.measures.findIndex((x) => (m.agg === 'count' ? x.agg === 'count' : x.field === m.field && x.agg !== 'count'));
    if (i >= 0) {
      if (q.measures.length > 1) setQuery({ ...q, measures: q.measures.filter((_, j) => j !== i), calcs: undefined });
    } else if (q.measures.length < 3) setQuery({ ...q, measures: [...q.measures, m] });
  };

  const allowed = allowedMarks(q);
  const drawn = res.status === 'ok' ? markOf(sheet.mark, q, res.result) : null;
  const countOn = q.measures.some((m) => m.agg === 'count');

  return (
    <aside className="panel inspector" aria-label={t('explore.ws.data')}>
      <div className="panel-h">
        <Database size={14} aria-hidden />
        {t('explore.ws.source')}
      </div>
      <div className="srcpick">
        <DropdownMenu>
          <DropdownMenuTrigger className="marktype" title={source.grain}>
            {source.label}
            <ChevronDown size={14} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="ws-menu">
            <DropdownMenuRadioGroup value={source.id} onValueChange={(v) => switchSource(v as string)}>
              {sources.map((s) => (
                <DropdownMenuRadioItem closeOnClick key={s.id} value={s.id}>
                  {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="scroll" style={{ flex: 1 }}>
        <div className="fgroup">
          <div className="fgroup-h">{t('explore.ws.documents')}</div>
          {docs.map((d) => (
            <label key={`${d.kind}${d.year}`} className="doc">
              <input type="checkbox" checked={docOn(d.kind, d.year)} onChange={() => toggleDoc(d.kind, d.year)} />
              {d.label}
            </label>
          ))}
        </div>
        <div className="fgroup">
          <div className="fgroup-h">{t('explore.ws.breakdowns')}</div>
          {source.fields
            .filter((f) => f.role === 'dimension')
            .map((f) => (
              <button key={f.id} type="button" draggable onDragStart={drag('dimension', f.id)} className={use(f) ? 'field in-use' : 'field'} aria-pressed={q.dimensions.includes(f.id)} onClick={() => toggleDim(f)}>
                <span className="glyph">Abc</span>
                {f.label}
                {use(f) && <span className="use">{use(f)}</span>}
              </button>
            ))}
        </div>
        <div className="fgroup">
          <div className="fgroup-h">{t('explore.ws.amounts')}</div>
          {source.fields
            .filter((f) => f.role === 'money')
            .map((f) => (
              <button key={f.id} type="button" draggable onDragStart={drag('money', f.id)} className={use(f) ? 'field in-use' : 'field'} aria-pressed={!!use(f)} onClick={() => toggleMeasure({ field: f.id, agg: 'sum' })}>
                <span className="glyph">₱</span>
                {f.label}
                {use(f) && <span className="use">{use(f)}</span>}
              </button>
            ))}
          <button type="button" draggable onDragStart={drag('money', '')} className={countOn ? 'field in-use' : 'field'} aria-pressed={countOn} onClick={() => toggleMeasure({ field: '', agg: 'count' })}>
            <span className="glyph">#</span>
            {t('explore.ws.count')}
            {countOn && <span className="use">{t('explore.ws.slot.columns')}</span>}
          </button>
        </div>
      </div>
      <div className="markcard">
        <div className="panel-h">
          <Layers size={14} aria-hidden />
          {t('explore.ws.marks')}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="marktype" data-testid="mark-menu">
            <BarChart3 size={16} aria-hidden />
            {t(`explore.ws.mark.${sheet.mark}` as MessageKey)}
            {sheet.mark === 'auto' && drawn && ` · ${t(`explore.ws.mark.${drawn}` as MessageKey)}`}
            <ChevronDown size={14} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="ws-menu">
            <DropdownMenuRadioGroup value={sheet.mark} onValueChange={(v) => setMark(v as Mark)}>
              {MARKS.map((m) => (
                <DropdownMenuRadioItem closeOnClick key={m} value={m} disabled={m !== 'auto' && !allowed.includes(m)}>
                  {t(`explore.ws.mark.${m}` as MessageKey)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}

// ---- shelves as a sentence ------------------------------------------------------

function Sentence({ catalogue, source, query: q, setQuery }: { catalogue: Catalogue; source: SourceInfo; query: WorkbookQuery; setQuery: (q: WorkbookQuery) => void }) {
  const t = useT();
  const dims = source.fields.filter((f) => f.role === 'dimension');
  const setDim = (i: number, id: string | null) => {
    const d = [...q.dimensions];
    if (id === null) d.splice(i, 1);
    else if (i < d.length) d[i] = id;
    else d.push(id);
    setQuery({ ...q, dimensions: [...new Set(d)] });
  };
  const calcOf = (j: number) => q.calcs?.find((c) => c.measure === j)?.type ?? 'value';
  const addMeasure = (id: string) => {
    const m = id ? { field: id, agg: 'sum' } : { field: '', agg: 'count' };
    if (q.measures.some((x) => (id ? x.field === id && x.agg !== 'count' : x.agg === 'count'))) return;
    // A fourth replaces the last: three is the most a sheet draws.
    setQuery({ ...q, measures: [...q.measures.slice(0, 2), m] });
  };
  const [seed, setSeed] = useState<{ field: string; n: number } | null>(null);

  return (
    <div className="sentence" aria-label={t('explore.ws.shelves')}>
      <span className="w">{t('explore.ws.show')}</span>
      <div className="slot">
        <small>{t('explore.ws.slot.columns')}</small>
        <div className="shelf-drop" data-testid="drop-columns" {...dropOn('money', addMeasure)}>
          {q.measures.map((m, j) => (
            <DropdownMenu key={`${m.agg}${m.field}`}>
              <DropdownMenuTrigger className="pill amt">
                <span className="glyph">{m.agg === 'count' ? '#' : '₱'}</span>
                {measureLabel(t, source, m)}
                {calcOf(j) !== 'value' && ` · ${t(`explore.ws.calc.${calcOf(j)}` as MessageKey)}`}
                <ChevronDown size={12} aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="ws-menu">
                {m.agg !== 'count' && (
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{t('explore.ws.aggregate')}</DropdownMenuLabel>
                    <DropdownMenuRadioGroup value={m.agg} onValueChange={(v) => setQuery({ ...q, measures: q.measures.map((x, k) => (k === j ? { ...x, agg: v as string } : x)) })}>
                      {[...AGGS, ...(q.dimensions.includes('barangay') ? (['perCapita'] as const) : [])].map((a) => (
                        <DropdownMenuRadioItem closeOnClick key={a} value={a}>
                          {t(`explore.ws.agg.${a}` as MessageKey)}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuGroup>
                )}
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t('explore.ws.showAs')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={calcOf(j)}
                    onValueChange={(v) => {
                      const rest = (q.calcs ?? []).filter((c) => c.measure !== j);
                      const calcs = v === 'value' ? rest : [...rest, { type: v as string, measure: j }];
                      setQuery({ ...q, calcs: calcs.length ? calcs : undefined });
                    }}
                  >
                    {(['value', ...CALCS] as const).map((c) => (
                      <DropdownMenuRadioItem closeOnClick key={c} value={c}>
                        {t(`explore.ws.calc.${c}` as MessageKey)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                {q.measures.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setQuery({ ...q, measures: q.measures.filter((_, k) => k !== j), calcs: undefined })}>{t('explore.ws.remove')}</DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>
      </div>
      <span className="w">{t('explore.ws.forEach')}</span>
      <DimSlot slot="rows" index={0} q={q} dims={dims} source={source} setDim={setDim} setQuery={setQuery} />
      <span className="w">{t('explore.ws.colouredBy')}</span>
      <DimSlot slot="colour" index={1} q={q} dims={dims} source={source} setDim={setDim} setQuery={setQuery} />
      <span className="grp">
        <span className="w">{t('explore.ws.where')}</span>
        <div className="slot">
          <small>{t('explore.ws.slot.filters')}</small>
          <div className="shelf-drop" data-testid="drop-filters" {...dropOn('dimension', (field) => setSeed((x) => ({ field, n: (x?.n ?? 0) + 1 })))}>
            {q.filters.map((f, i) => (
              <span key={`${f.field}${i}`} className="pill flt">
                {fieldLabel(source, f.field)} {filterText(t, catalogue, f)}
                <button type="button" className="x" aria-label={`${t('explore.ws.remove')} ${fieldLabel(source, f.field)}`} onClick={() => setQuery({ ...q, filters: q.filters.filter((_, k) => k !== i) })} style={{ border: 0, background: 'none', padding: 0 }}>
                  <X size={12} />
                </button>
              </span>
            ))}
            {!q.filters.length && <span className="drop-hint">{t('explore.teach.dropFilters')}</span>}
            <AddFilter key={seed?.n ?? 0} seed={seed?.field} catalogue={catalogue} source={source} onAdd={(f) => setQuery({ ...q, filters: [...q.filters.filter((x) => x.field !== f.field), f] })} />
          </div>
        </div>
      </span>
    </div>
  );
}

function DimSlot({
  slot,
  index,
  q,
  dims,
  source,
  setDim,
  setQuery,
}: {
  slot: 'rows' | 'colour';
  index: number;
  q: WorkbookQuery;
  dims: Field[];
  source: SourceInfo;
  setDim: (i: number, id: string | null) => void;
  setQuery: (q: WorkbookQuery) => void;
}) {
  const t = useT();
  const id = q.dimensions[index];
  const disabled = index > q.dimensions.length;
  // Colour before Rows has nothing to colour: the field goes on Rows instead.
  const drop = dropOn('dimension', (f) => setDim(Math.min(index, q.dimensions.length), f));
  return (
    <div className="slot">
      <small>{t(`explore.ws.slot.${slot}`)}</small>
      <div className={id ? 'shelf-drop' : 'shelf-drop empty'} data-testid={`drop-${slot}`} {...drop}>
        <DropdownMenu>
          <DropdownMenuTrigger className={id ? 'pill dim' : 'pill'} disabled={disabled} data-testid={`slot-${slot}`}>
            <span className="glyph">Abc</span>
            {id ? fieldLabel(source, id) : t(index === 0 ? 'explore.teach.dropRows' : 'explore.ws.none')}
            {index === 0 && id && q.limit && ` · ${t('explore.ws.topN', { n: q.limit })}`}
            <ChevronDown size={12} aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="ws-menu">
            <DropdownMenuRadioGroup value={id ?? ''} onValueChange={(v) => setDim(index, (v as string) || null)}>
              {index > 0 && <DropdownMenuRadioItem closeOnClick value="">{t('explore.ws.none')}</DropdownMenuRadioItem>}
              {dims.map((f) => (
                <DropdownMenuRadioItem closeOnClick key={f.id} value={f.id} disabled={q.dimensions.includes(f.id) && f.id !== id}>
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            {index === 0 && id && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t('explore.ws.rowsShown')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={String(q.limit ?? 'all')}
                    onValueChange={(v) => {
                      const { limit: _drop, ...rest } = q;
                      void _drop;
                      setQuery(v === 'all' ? rest : { ...rest, limit: Number(v) });
                    }}
                  >
                    {TOPS.map((n) => (
                      <DropdownMenuRadioItem closeOnClick key={n} value={String(n)}>
                        {t('explore.ws.topN', { n })}
                      </DropdownMenuRadioItem>
                    ))}
                    <DropdownMenuRadioItem closeOnClick value="all">{t('explore.ws.all')}</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
                {q.dimensions.length > 1 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setDim(0, null)}>{t('explore.ws.remove')}</DropdownMenuItem>
                  </>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function filterText(t: ReturnType<typeof useT>, catalogue: Catalogue, f: WorkbookQuery['filters'][number]): string {
  if (f.op === 'contains') return `${t('explore.ws.contains')} “${f.text}”`;
  if (f.op === 'between') return `${f.min ?? '…'}–${f.max ?? '…'}`;
  const values = (catalogue.dimensions as Record<string, { id: string; label: string }[]>)[f.field] ?? [];
  const names = f.values.map((v) => values.find((x) => x.id === v)?.label ?? v);
  const shown = names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
  return `${t(f.op === 'notIn' ? 'explore.ws.isNot' : 'explore.ws.is')} ${shown}`;
}

function AddFilter({ catalogue, source, seed, onAdd }: { catalogue: Catalogue; source: SourceInfo; seed?: string; onAdd: (f: WorkbookQuery['filters'][number]) => void }) {
  const t = useT();
  const values = catalogue.dimensions as Record<string, { id: string; label: string; sublabel?: string }[]>;
  const fields = source.fields.filter((f) => f.role === 'dimension' && ((f.type === 'code' || f.type === 'split') && values[f.id]?.length ? true : f.type === 'text'));
  // A field dropped on Filters opens this already set to it (remounted with a new key).
  const seeded = fields.some((f) => f.id === seed);
  const [open, setOpen] = useState(seeded);
  const [field, setField] = useState(seeded ? seed! : (fields[0]?.id ?? ''));
  const [find, setFind] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const def = fields.find((f) => f.id === field);
  const list = (values[field] ?? []).filter((v) => `${v.id} ${v.label} ${v.sublabel ?? ''}`.toLowerCase().includes(find.toLowerCase()));
  const apply = () => {
    if (def?.type === 'text') {
      if (find.trim()) onAdd({ field, op: 'contains', text: find.trim().slice(0, 60) });
    } else if (picked.length) onAdd({ field, op: 'in', values: picked.slice(0, 50) });
    setOpen(false);
    setFind('');
    setPicked([]);
  };
  if (!fields.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="iconbtn" style={{ width: 24, height: 24 }} aria-label={t('explore.ws.addFilter')} title={t('explore.ws.addFilter')}>
        <Plus size={14} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 space-y-2 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-semibold">{t('explore.ws.filterField')}</span>
          <select
            aria-label={t('explore.ws.filterField')}
            value={field}
            onChange={(e) => {
              setField(e.target.value);
              setPicked([]);
              setFind('');
            }}
            className="h-8 rounded-md border border-border bg-background px-2"
          >
            {fields.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <input
          value={find}
          onChange={(e) => setFind(e.target.value)}
          maxLength={60}
          placeholder={t(def?.type === 'text' ? 'explore.ws.containsPlaceholder' : 'explore.ws.filterSearch')}
          aria-label={t(def?.type === 'text' ? 'explore.ws.containsPlaceholder' : 'explore.ws.filterSearch')}
          className="h-8 w-full rounded-md border border-border bg-background px-2"
          onKeyDown={(e) => e.key === 'Enter' && apply()}
        />
        {def?.type !== 'text' && (
          <div className="max-h-56 overflow-auto">
            {list.map((v) => (
              <label key={v.id} className="flex items-start gap-2 py-0.5">
                <input type="checkbox" checked={picked.includes(v.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, v.id] : p.filter((x) => x !== v.id)))} />
                <span>
                  {v.label}
                  {v.sublabel && <span className="block text-xs text-muted-foreground">{v.sublabel}</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <button type="button" onClick={apply} className="h-8 rounded-md bg-foreground px-3 text-background">
          {t('explore.ws.apply')}
        </button>
      </PopoverContent>
    </Popover>
  );
}

// ---- canvas -----------------------------------------------------------------------

function Canvas({
  catalogue,
  sheet,
  source,
  res,
  dark,
  setQuery,
  initialView = 'chart',
  teach,
}: {
  catalogue: Catalogue;
  sheet: Sheet;
  source: SourceInfo;
  res: Res;
  dark: boolean;
  setQuery: (q: WorkbookQuery) => void;
  initialView?: 'chart' | 'records';
  teach: { starters: Starter[]; openStarter: (s: Starter) => void; openGuide: (tab: GuideTab) => void };
}) {
  const t = useT();
  const q = sheet.query;
  const [view, setView] = useState<'chart' | 'table' | 'records'>(initialView);
  const [pick, setPick] = useState<{ p: Picked; at: At } | null>(null);
  // Records of one clicked value; cleared when the view is picked by hand.
  const [only, setOnly] = useState<Picked | null>(null);
  const title = sheetTitle(t, source, q);
  const r = res.status === 'ok' ? res.result : null;
  const mark = r ? markOf(sheet.mark, q, r) : null;
  const legend = useMemo(() => (r ? chartData(r, { series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `var(--s${i})`), ink: '', muted: '', grid: '', paper: '', font: '' }) : null), [r]);
  // The subtitle is written from the query, never by a model (specs/020 A1.2, Kong 2019).
  const sub = r
    ? [
        r.documents.map((d) => d.label).join(t('explore.ws.and')),
        ...q.filters.map((f) => `${fieldLabel(source, f.field)} ${filterText(t, catalogue, f)}`),
        t(`explore.ws.unit.${unitOf(r)}` as MessageKey),
        t('explore.ws.records', { n: r.n.toLocaleString('en-PH') }),
        ...(q.limit && q.dimensions.length ? [t('explore.ws.topOther', { n: q.limit })] : []),
      ].join(' · ')
    : '';
  // A chart that would mislead is shown as the table, with the reason (specs/020 A1.5).
  const why = r && mark ? lint(mark, r) : null;
  const blank = isBlank(q);
  // A blank sheet teaches in Chart and Table alike, so neither is greyed out (P7).
  const shown = view === 'chart' && (mark === 'table' || why) && !blank ? 'table' : view;
  const onPick = pickable(q) ? (p: Picked, at: At) => setPick({ p, at }) : undefined;
  const drillTo = pick ? drillField(pick.p.field, source.fields, q.dimensions) : null;
  const act = (a: PickAction) => {
    const p = pick!.p;
    setPick(null);
    if (a === 'records') {
      setOnly(p);
      setView('records');
    } else setQuery(narrow(q, p, a, source.fields));
  };
  const recordsQuery = only ? narrow(q, only, 'keep', source.fields) : q;
  const views = [
    ['chart', BarChart3, 'explore.ws.chartView'],
    ['table', Table2, 'explore.ws.tableView'],
    ['records', ListTree, 'explore.ws.recordsView'],
  ] as const;

  return (
    <section className="canvas" style={{ flex: 1 }} aria-label={title}>
      <div className="canvas-h">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 className="canvas-title">{title}</h1>
          <p className="canvas-sub">
            {sub}
            {shown === 'records' && only && (
              <span className="chip" style={{ marginLeft: 8 }}>
                {only.label}
                <button type="button" className="x" aria-label={t('explore.ws.board.clear')} onClick={() => setOnly(null)}>
                  <X size={12} />
                </button>
              </span>
            )}
          </p>
        </div>
        <div className="seg" role="group" aria-label={t('explore.ws.viewAs')}>
          {views.map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={shown === v}
              disabled={v === 'chart' && (mark === 'table' || !!why) && !blank}
              onClick={() => {
                setOnly(null);
                setView(v);
              }}
            >
              <Icon size={14} aria-hidden />
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      {why && view === 'chart' && !blank && (
        <p className="canvas-note" role="note" data-testid="lint-note">
          {t('explore.lint.shownAsTable', { reason: t(`explore.lint.${why}` as MessageKey) })}
        </p>
      )}
      {legend && shown === 'chart' && mark !== 'heatmap' && mark !== 'treemap' && mark !== 'kpi' && (legend.series.length > 1 || legend.drafts) && (
        <div className="legend" aria-label={t('explore.ws.legend')}>
          {legend.series.map((s, i) => {
            const d = legend.data.find((x) => x.s === s)!;
            return (
              <span key={s} className="k">
                <span className="num">{i + 1}</span>
                <span className={d.draft ? 'sw hatched' : 'sw'} style={{ ['--c' as string]: d.stroke, background: d.draft ? undefined : d.stroke }} />
                {s}
                {legend.data.some((x) => x.s === s && x.draft) && <span className="chip chip-draft">{t('explore.ws.draft')}</span>}
              </span>
            );
          })}
        </div>
      )}
      <div className="chart" style={{ display: 'flex', overflow: shown === 'table' ? 'auto' : 'hidden' }}>
        {shown === 'records' ? (
          <Records key={JSON.stringify(recordsQuery)} query={recordsQuery} />
        ) : blank ? (
          <Blank title={title} r={r} {...teach} />
        ) : (
          <>
            {res.status === 'loading' && <p className="canvas-msg">{t('explore.ws.loading')}</p>}
            {res.status === 'error' && (
              <p className="canvas-msg" role="alert">
                {res.kind === 'invalid' ? t('explore.ws.invalid', { reasons: (res.errors ?? []).join(' ') }) : t(res.kind === 'limit' ? 'explore.ask.limit' : 'explore.ask.failed')}
              </p>
            )}
            {r && !r.rows.length && <p className="canvas-msg">{t('explore.teach.empty')}</p>}
            {r &&
              r.rows.length > 0 &&
              (shown === 'table' ? (
                <ResultTable r={r} onPick={onPick} />
              ) : (
                <VegaChart
                  mark={mark!}
                  result={r}
                  dark={dark}
                  svgId={SVG_ID}
                  label={`${title}. ${sub}`}
                  onPick={onPick && ((d, at) => onPick({ field: q.dimensions[0], code: d.k0!, label: d.l0 ?? d.y }, at))}
                />
              ))}
          </>
        )}
      </div>
      {r && r.documents.length > 1 && <p className="canvas-note">{t('explore.ws.neverAdded')}</p>}
      {pick && <PickMenu pick={pick.p} at={pick.at} drillTo={drillTo && fieldLabel(source, drillTo)} onAct={act} onClose={() => setPick(null)} />}
    </section>
  );
}

/** A sheet with no breakdown (P7, W13): three ways to start, instead of a one-row table. */
function Blank({
  title,
  r,
  starters,
  openStarter,
  openGuide,
}: {
  title: string;
  r: QueryResultOrNull;
  starters: Starter[];
  openStarter: (s: Starter) => void;
  openGuide: (tab: GuideTab) => void;
}) {
  const t = useT();
  const total = r?.rows[0]?.values[0];
  return (
    <div className="teach" data-testid="blank-sheet">
      <h2>{t('explore.teach.blankTitle')}</h2>
      {total != null && <p>{t('explore.teach.total', { measure: title, document: r!.documents.map((d) => d.label).join(t('explore.ws.and')), total: formatValue(total, r!.columns[0].role) })}</p>}
      <ol>
        <li>{t('explore.teach.ask')}</li>
        <li>{t('explore.teach.drag')}</li>
        <li>
          {t('explore.teach.starter')}
          <StarterList starters={starters} onOpen={openStarter} />
        </li>
      </ol>
      <p className="teach-links">
        <button type="button" className="btn" onClick={() => openGuide('guide')}>
          {t('explore.teach.guide')}
        </button>
        <button type="button" className="btn" onClick={() => openGuide('about')}>
          {t('explore.teach.about')}
        </button>
      </p>
    </div>
  );
}
type QueryResultOrNull = Extract<Res, { status: 'ok' }>['result'] | null;

// ---- sheet tabs --------------------------------------------------------------------

function Tabs({ wb, commit }: { wb: Workbook; commit: (f: (w: Workbook) => Workbook) => void }) {
  const t = useT();
  const [editing, setEditing] = useState<string | null>(null);
  const boards = wb.dashboards ?? [];
  const add = () =>
    commit((w) => {
      if (w.sheets.length >= 20) return w;
      const cur = w.sheets[w.active];
      return { ...withoutBoard(w), sheets: [...w.sheets, newSheet(t('explore.ws.sheet', { n: w.sheets.length + 1 }), blankQuery(cur.query))], active: w.sheets.length };
    });
  const addBoard = () =>
    commit((w) => {
      const ds = w.dashboards ?? [];
      if (ds.length >= MAX_DASHBOARDS) return w;
      const d = { id: newId(), name: t('explore.ws.board.name', { n: ds.length + 1 }), sheets: w.sheets.slice(0, MAX_TILES).map((s) => s.id) };
      return { ...w, dashboards: [...ds, d], board: d.id };
    });
  // A closed sheet leaves every dashboard; a dashboard left with none goes too.
  const close = (i: number) =>
    commit((w) => {
      const gone = w.sheets[i].id;
      const ds = (w.dashboards ?? []).map((d) => ({ ...d, sheets: d.sheets.filter((x) => x !== gone) })).filter((d) => d.sheets.length);
      const { dashboards: _d, ...rest } = withoutBoard(w);
      void _d;
      return { ...rest, ...(ds.length ? { dashboards: ds } : {}), sheets: w.sheets.filter((_, k) => k !== i), active: Math.max(0, w.active >= i ? w.active - 1 : w.active) };
    });
  const closeBoard = (id: string) =>
    commit((w) => {
      const ds = (w.dashboards ?? []).filter((d) => d.id !== id);
      const { dashboards: _d, ...rest } = withoutBoard(w);
      void _d;
      return ds.length ? { ...rest, dashboards: ds } : rest;
    });
  const rename = (id: string, name: string) => {
    setEditing(null);
    const v = name.trim().slice(0, 60);
    if (!v || /[<>]/.test(v)) return;
    commit((w) => ({
      ...w,
      sheets: w.sheets.map((s) => (s.id === id ? { ...s, name: v } : s)),
      ...(w.dashboards ? { dashboards: w.dashboards.map((d) => (d.id === id ? { ...d, name: v } : d)) } : {}),
    }));
  };
  const tab = (id: string, name: string, selected: boolean, open: () => void, onClose: (() => void) | null, icon?: React.ReactNode) => (
    <span key={id} className={selected ? 'tab on' : 'tab'}>
      {icon}
      {editing === id ? (
        <input autoFocus defaultValue={name} maxLength={60} aria-label={t('explore.ws.sheetName')} onBlur={(e) => rename(id, e.target.value)} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
      ) : (
        <button type="button" aria-current={selected ? 'page' : undefined} style={{ border: 0, background: 'none', padding: 0, color: 'inherit', font: 'inherit' }} title={t('explore.ws.renameHint')} onClick={open} onDoubleClick={() => setEditing(id)}>
          {name}
        </button>
      )}
      {onClose && selected && (
        <button type="button" className="x" style={{ border: 0, background: 'none', padding: 0 }} aria-label={t('explore.ws.closeSheet', { sheet: name })} onClick={onClose}>
          <X size={12} />
        </button>
      )}
    </span>
  );
  return (
    <nav className="tabs" aria-label={t('explore.ws.sheets')}>
      {wb.sheets.map((s, i) =>
        tab(s.id, s.name, !wb.board && i === wb.active, () => commit((w) => (w.active === i && !w.board ? w : { ...withoutBoard(w), active: i })), wb.sheets.length > 1 ? () => close(i) : null),
      )}
      <button type="button" className="tab" aria-label={t('explore.ws.addSheet')} title={t('explore.ws.addSheet')} onClick={add}>
        <Plus size={14} />
      </button>
      {boards.map((d) => tab(d.id, d.name, wb.board === d.id, () => commit((w) => (w.board === d.id ? w : { ...w, board: d.id })), () => closeBoard(d.id), <LayoutGrid size={13} aria-hidden />))}
      <button type="button" className="tab" onClick={addBoard} disabled={boards.length >= MAX_DASHBOARDS} data-testid="add-board">
        <Plus size={14} aria-hidden />
        {t('explore.ws.board.add')}
      </button>
    </nav>
  );
}
