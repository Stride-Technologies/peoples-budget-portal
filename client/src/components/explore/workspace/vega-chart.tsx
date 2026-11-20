'use client';

/**
 * One sheet's chart, drawn by Vega (W4). The CSP has no `unsafe-eval` in
 * production and Vega compiles expressions with `Function` by default, so the
 * spec is parsed to an AST and run by `vega-interpreter`. Vega is imported
 * here only, so it loads with the workspace (desktop) and never on phones.
 */
import { useEffect, useRef, useState } from 'react';
import { compile, hatchDefs, type Datum, type Drawn, type QueryResult, type Theme } from '@/lib/explore/compile';

/** The chart colours of the current theme, from the workspace's CSS tokens. */
export function readTheme(): Theme {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--s${i}`)),
    ink: v('--ink'),
    muted: v('--ink-muted'),
    grid: v('--chart-grid'),
    paper: v('--chart-surface'),
    // A generic family last, so a downloaded picture (no web fonts) stays sans-serif.
    font: `${getComputedStyle(document.body).fontFamily}, system-ui, sans-serif`,
    display: `${v('--font-heading') || getComputedStyle(document.body).fontFamily}, system-ui, sans-serif`,
  };
}

export function VegaChart({
  mark,
  result,
  dark,
  svgId,
  label,
  onPick,
}: {
  mark: Drawn;
  result: QueryResult;
  dark: boolean;
  svgId: string;
  label: string;
  /** A click on a mark that stands for one value of the first breakdown, at page coordinates. */
  onPick?: (d: Datum, at: { x: number; y: number }) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  // Read at click time, so a new handler each render does not redraw the chart.
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    const el = box.current!;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!size) return;
    const el = box.current!;
    let view: { finalize: () => void } | null = null;
    let cancelled = false;
    (async () => {
      const [vega, vl, { expressionInterpreter }] = await Promise.all([import('vega'), import('vega-lite'), import('vega-interpreter')]);
      if (cancelled) return;
      const theme = readTheme();
      const out = compile(mark, result, theme, size);
      if (!out) return;
      const spec = out.kind === 'vega-lite' ? vl.compile(out.spec as unknown as Parameters<typeof vl.compile>[0]).spec : out.spec;
      const v = new vega.View(vega.parse(spec as never, undefined, { ast: true }), {
        expr: expressionInterpreter,
        renderer: 'svg',
        container: el,
        hover: true,
      });
      view = v;
      v.addEventListener('click', (e, item) => {
        const d = (item as { datum?: Datum } | null)?.datum;
        const ev = e as MouseEvent;
        if (d && d.k0 !== undefined && d.k0 !== null && pick.current) pick.current(d, { x: ev.clientX, y: ev.clientY });
      });
      await v.runAsync();
      if (cancelled) return v.finalize();
      const svg = el.querySelector('svg');
      if (svg) {
        svg.id = svgId;
        svg.setAttribute('role', 'img');
        svg.setAttribute('aria-label', label);
        // Draft hatching lives inside the chart's own SVG, so a download keeps it.
        svg.insertAdjacentHTML('afterbegin', hatchDefs(theme));
      }
      setFailed(null);
    })().catch((e: Error) => !cancelled && setFailed(e.message));
    return () => {
      cancelled = true;
      view?.finalize();
      el.replaceChildren();
    };
  }, [mark, result, dark, size, svgId, label]);

  return (
    <div className="vg-chart" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {failed && <p className="canvas-msg">{failed}</p>}
    </div>
  );
}
