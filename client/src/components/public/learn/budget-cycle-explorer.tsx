'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  EXAMPLE_FY,
  whenFor,
  hasUnconfirmed,
  stageFromHash,
  visibleWho,
  type BudgetStage,
  type Lane,
} from '@/lib/budget-cycle';
import { cycleCopy } from '@/i18n/budget-cycle';
import { useLocale, useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import { isProd } from '@/lib/site-env';
import { CopyParts, UnconfirmedCopy } from '@/components/public/unconfirmed-copy';
import { cn } from '@/lib/utils';
import { useBrand } from '@/components/brand/brand-provider';
import { messageVars } from '@/lib/brand';



/**
 * The budget cycle as a diagram you can click, with the chosen stage explained
 * beside it (below it on a phone).
 *
 * Time runs down the left edge and the three columns are who does the work. The
 * diagram is a fixed-geometry SVG: box positions live with the copy in
 * `budget-cycle.ts`, the connecting lines here. It keeps a minimum width and
 * scrolls sideways inside its card on a phone rather than shrinking past
 * legibility. `#stage-N` selects a stage, so a stage can be linked to.
 */

const LANE_FILL: Record<Lane, { bg: string; box: string; line: string }> = {
  plan: { bg: '#F2F7F5', box: '#E6F1EE', line: '#2F6F5E' },
  budget: { bg: '#FAF7EE', box: '#F3EEDF', line: '#8A6A1F' },
  decide: { bg: '#FBF4F5', box: '#F4E7E9', line: '#8E2F45' },
};
const LANE_X: Record<Lane, number> = { plan: 96, budget: 290, decide: 484 };

const SHOW_REVIEW = !isProd;

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * Word-wrap for a translated box label (specs/014). English keeps the line
 * breaks set by hand in `box.lines`; other languages have none, and a box is
 * 168px wide — about 22 characters of the title, 26 of the short line.
 */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const word of text.split(' ')) {
    const last = lines[lines.length - 1];
    if (last !== undefined && (last + ' ' + word).length <= width) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

function Diagram({
  current,
  onSelect,
  stages,
  laneLabel,
  english,
  t,
}: {
  current: number;
  onSelect: (n: number) => void;
  stages: readonly BudgetStage[];
  laneLabel: Record<Lane, string>;
  english: boolean;
  t: T;
}) {
  const fy = EXAMPLE_FY;
  const prev = fy - 1;
  const months: [number, string, string][] = [
    [120, t('learn.explorer.months.marJun'), String(prev)],
    [278, t('learn.explorer.months.julOct'), String(prev)],
    [468, t('learn.explorer.months.oct'), String(prev)],
    [564, t('learn.explorer.months.octDec'), String(prev)],
    [660, t('learn.explorer.months.dec'), String(prev)],
    [770, t('learn.explorer.months.fyOn', { fy }), t('learn.explorer.months.midNext', { next: fy + 1 })],
  ];
  const onKey = (n: number) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(n);
    }
  };

  return (
    <svg viewBox="0 0 692 860" className="block h-auto w-full min-w-[560px]">
      <defs>
        <marker id="bc-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-muted)" />
        </marker>
      </defs>

      {(Object.keys(LANE_X) as Lane[]).map((lane) => (
        <g key={lane}>
          <rect x={LANE_X[lane]} y={52} width={180} height={798} rx={12} fill={LANE_FILL[lane].bg} stroke="var(--rule)" />
          <text x={LANE_X[lane] + 90} y={76} textAnchor="middle" className="fill-ink-faint font-mono text-[10.5px] uppercase tracking-[0.12em]">
            {laneLabel[lane]}
          </text>
        </g>
      ))}

      {months.map(([y, a, b]) => (
        <text key={y} x={10} y={y} className="fill-ink-muted font-mono text-[11px]">
          {a}
          <tspan x={10} dy={15}>{b}</tspan>
        </text>
      ))}
      <path d="M86 200 V370" stroke="var(--rule)" strokeWidth={2} />

      {/* "at the same time" */}
      <g className="fill-ink-muted font-mono text-[10px]" fill="none">
        <rect x={96} y={190} width={374} height={190} rx={14} stroke="var(--ink-faint)" strokeDasharray="3 4" fill="none" />
        <text x={492} y={270} className="fill-ink-muted">{t('learn.explorer.note.sameTime1')}</text>
        <text x={492} y={286} className="fill-ink-muted">{t('learn.explorer.note.sameTime2')}</text>
        <text x={492} y={302} className="fill-ink-muted">{t('learn.explorer.note.sameTime3')}</text>
        <rect x={96} y={732} width={568} height={88} rx={14} stroke="var(--ink-faint)" strokeDasharray="3 4" fill="none" />
        <text x={380} y={838} textAnchor="middle" className="fill-ink-muted">
          {t('learn.explorer.note.sameTimeEnd')}
        </text>
      </g>

      {/* connections */}
      <g fill="none" stroke="var(--ink-muted)" strokeWidth={1.5}>
        <path d="M186 156 V196" markerEnd="url(#bc-arr)" />
        <path d="M186 264 V302" markerEnd="url(#bc-arr)" />
        <path d="M270 232 H292" markerEnd="url(#bc-arr)" strokeDasharray="5 4" />
        <path d="M296 338 H274" markerEnd="url(#bc-arr)" strokeDasharray="5 4" />
        <path d="M186 370 V408 H574 V436" markerEnd="url(#bc-arr)" />
        <path d="M380 370 V408" />
        <path d="M574 504 V532" markerEnd="url(#bc-arr)" />
        <path d="M574 600 V628" markerEnd="url(#bc-arr)" />
        <path d="M658 664 H676 V568 H662" markerEnd="url(#bc-arr)" strokeDasharray="5 4" />
        <path d="M574 696 V740" markerEnd="url(#bc-arr)" />
        <path d="M490 664 H380 V740" markerEnd="url(#bc-arr)" />
        <path d="M490 776 H468" markerEnd="url(#bc-arr)" strokeDasharray="5 4" />
        <path d="M296 776 H274" markerEnd="url(#bc-arr)" />
      </g>
      <circle cx={380} cy={408} r={3.5} fill="var(--ink-muted)" />
      <g className="fill-ink-muted font-sans text-[11px]">
        <text x={194} y={181}>{t('learn.explorer.edge.priorities')}</text>
        <text x={392} y={426}>{t('learn.explorer.edge.meet')}</text>
        <text x={684} y={616} textAnchor="middle" transform="rotate(90 684 616)">{t('learn.explorer.edge.veto')}</text>
        <text x={582} y={722}>{t('learn.explorer.edge.review')}</text>
        <text x={372} y={722} textAnchor="end">{t('learn.explorer.edge.january')}</text>
      </g>

      {stages.map((s) => {
        const { x, y, w, h } = s.box;
        const title = english ? (s.box.lines?.title ?? [s.title]) : wrap(s.title, 22);
        const short = english ? (s.box.lines?.short ?? [s.short]) : wrap(s.short, 26);
        const on = s.n === current;
        const tone = LANE_FILL[s.lane];
        return (
          <g
            key={s.n}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            aria-label={t('learn.explorer.stageAria', { n: s.n, title: s.title, when: whenFor(s.when, fy) })}
            onClick={() => onSelect(s.n)}
            onKeyDown={onKey(s.n)}
            className="group cursor-pointer outline-none"
          >
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              rx={10}
              fill={tone.box}
              stroke={on ? 'var(--ink)' : tone.line}
              strokeWidth={on ? 2.5 : 1.5}
              className="transition-[stroke-width] group-hover:[stroke-width:2.5]"
            />
            <rect
              x={x - 4}
              y={y - 4}
              width={w + 8}
              height={h + 8}
              rx={13}
              fill="none"
              stroke="var(--ink)"
              strokeWidth={2}
              className="opacity-0 group-focus-visible:opacity-100"
            />
            <text x={x + 12} y={y + 20} className="fill-ink-muted font-mono text-[10.5px] tracking-[0.08em]">
              {String(s.n).padStart(2, '0')}
            </text>
            <text className={cn('fill-ink font-display text-[13px] font-bold', on && 'underline')}>
              {title.map((line, k) => (
                <tspan key={k} x={x + 12} y={y + 38 + k * 17}>{line}</tspan>
              ))}
            </text>
            <text className="fill-ink-muted font-sans text-[11.5px]">
              {short.map((line, k) => (
                <tspan key={k} x={x + 12} y={y + 54 + (title.length - 1) * 17 + k * 15}>{line}</tspan>
              ))}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Panel({
  n,
  onSelect,
  stages,
  t,
}: {
  n: number;
  onSelect: (n: number) => void;
  stages: readonly BudgetStage[];
  t: T;
}) {
  const s = stages[n];
  const prev = stages[n - 1];
  const next = stages[n + 1];
  const label = 'font-mono text-[0.6875rem] uppercase tracking-[0.14em] text-ink-faint';
  return (
    <>
      <p className={label}>
        {t('learn.explorer.stageOf', { n: s.n, total: stages.length - 1, when: whenFor(s.when, EXAMPLE_FY) })}
      </p>
      <h3 className="mt-3 font-display text-[clamp(1.4rem,1.1rem+1vw,1.75rem)] font-medium leading-[1.15] tracking-[-0.03em] text-ink">
        {s.title}
      </h3>
      <p className="mt-1.5 text-sm text-ink-faint">{t('learn.explorer.officially', { name: s.official })}</p>
      <p className="mt-5 text-[1.0625rem] leading-7 text-ink">
        <UnconfirmedCopy copy={s.what} />
      </p>

      <div className="mt-6 grid gap-6">
        <div>
          <h4 className={label}>{t('learn.explorer.who')}</h4>
          <ul className="mt-3 divide-y divide-rule">
            {visibleWho(s, isProd).map((w) => (
              <li key={w.name} className="py-2.5 text-[0.9375rem] leading-6 text-ink-muted first:pt-0">
                <strong className="font-semibold text-ink">{w.name}</strong>
                <br />
                <CopyParts parts={w.role} />
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className={label}>{t('learn.explorer.out')}</h4>
          <ul className="mt-3 divide-y divide-rule">
            {s.out.map((o) => (
              <li key={o.name} className="py-2.5 text-[0.9375rem] leading-6 text-ink-muted first:pt-0">
                <strong className="font-semibold text-ink">{o.name}</strong>
                <br />
                {o.meaning}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl bg-paper-tint p-5">
          <h4 className={label}>{t('learn.explorer.you')}</h4>
          <p className="mt-3 text-[0.9375rem] leading-6 text-ink">
            <UnconfirmedCopy copy={s.you} />
          </p>
        </div>
        <div>
          <h4 className={label}>{t('learn.explorer.know')}</h4>
          <p className="mt-3 text-[0.9375rem] leading-6 text-ink-muted">
            <UnconfirmedCopy copy={s.know} />
          </p>
        </div>
      </div>

      <div className="mt-8 flex justify-between gap-3 border-t border-rule pt-5">
        <button
          type="button"
          disabled={!prev}
          onClick={() => prev && onSelect(prev.n)}
          className="min-h-11 rounded-full border border-rule px-4 text-sm text-ink transition-colors hover:border-ink-muted disabled:opacity-40 disabled:hover:border-rule"
        >
          ← {prev ? prev.title : t('learn.explorer.start')}
        </button>
        <button
          type="button"
          disabled={!next}
          onClick={() => next && onSelect(next.n)}
          className="min-h-11 rounded-full border border-rule px-4 text-sm text-ink transition-colors hover:border-ink-muted disabled:opacity-40 disabled:hover:border-rule"
        >
          {next ? next.title : t('learn.explorer.end')} →
        </button>
      </div>
    </>
  );
}

export function BudgetCycleExplorer() {
  const locale = useLocale();
  const t = useT();
  // The stage copy in the visitor's language (lib/budget-cycle.ts is the English).
  const brand = useBrand();
  const { stages, laneLabel, lanePeople } = useMemo(() => cycleCopy(locale, messageVars(brand, locale)), [locale, brand]);
  const [current, setCurrent] = useState(0);
  const panelRef = useRef<HTMLElement>(null);

  // Deep links: /learn#stage-6 opens on stage 6, and so does the back button.
  useEffect(() => {
    const sync = () => {
      const n = stageFromHash(window.location.hash);
      if (n === null) return;
      setCurrent(n);
      document.getElementById('budget-cycle')?.scrollIntoView({ block: 'start' });
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const select = useCallback((n: number, fromDiagram = true) => {
    setCurrent(n);
    window.history.replaceState(null, '', `#stage-${n}`);
    // Stacked layout: the panel is below the diagram, so bring it into view.
    if (fromDiagram && window.matchMedia('(max-width: 1023px)').matches) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      panelRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }, []);

  const anyUnconfirmed = SHOW_REVIEW && stages.some(hasUnconfirmed);

  return (
    <div id="budget-cycle" className="scroll-mt-24">
      {anyUnconfirmed && (
        <p className="mb-5 rounded-lg bg-[#FFF1B8] px-4 py-3 text-sm text-[#5C4500]">
          {t('learn.explorer.review')}
        </p>
      )}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,600px)_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div>
          <div
            role="group"
            aria-label={t('learn.explorer.diagramAria')}
            className="overflow-x-auto rounded-2xl border border-rule bg-paper-raised"
          >
            <Diagram
              current={current}
              onSelect={(n) => select(n)}
              stages={stages}
              laneLabel={laneLabel}
              english={locale === 'en'}
              t={t}
            />
          </div>
          <ul className="mt-3 space-y-0.5 text-[0.8125rem] text-ink-faint">
            {(Object.keys(laneLabel) as Lane[]).map((lane) => (
              <li key={lane}>
                <b className="font-semibold text-ink-muted">{laneLabel[lane]}</b>: {lanePeople[lane]}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] text-ink-faint">
            {t('learn.explorer.hint')}
          </p>
        </div>
        <article
          ref={panelRef}
          aria-live="polite"
          className="scroll-mt-24 rounded-2xl border border-rule bg-paper-raised px-5 py-7 sm:px-9 sm:py-8 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7.5rem)] lg:overflow-y-auto"
        >
          <Panel n={current} onSelect={(n) => select(n, false)} stages={stages} t={t} />
        </article>
      </div>
    </div>
  );
}
