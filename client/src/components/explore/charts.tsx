/**
 * The explorer's three drawn charts, as hand-written SVG (DESIGN.md: no chart
 * library on public pages). Server-renderable: no hooks, no state. Every bar
 * and point carries its value as text, series differ by pattern and marker
 * shape as well as tone, and the table under the chart is always rendered —
 * colour is never the only signal.
 *
 * The SVG carries its own title and source line so a downloaded PNG/SVG
 * (share sheet) is self-describing.
 */
import { fmt, maxStack, maxValue, type Line } from '@/lib/explore/chart-data';
import type { ResolvedSeries } from '@/lib/explore/view-url';

const W = 640;
const PAD = 16;
const LABEL_H = 18;
const BAR_H = 14;
const ROW_GAP = 14;
const HEAD_H = 44;
const FOOT_H = 34;

/** Series 0 solid, 1 hatched, 2 dotted, 3 outlined — distinguishable in greyscale. */
const FILLS = ['currentColor', 'url(#ex-hatch)', 'url(#ex-dots)', 'none'];
const MARKERS = ['circle', 'square', 'triangle', 'diamond'] as const;

function Defs() {
  return (
    <defs>
      <pattern id="ex-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="6" height="6" fill="var(--paper, #FDFDF8)" />
        <line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="3" />
      </pattern>
      <pattern id="ex-dots" width="5" height="5" patternUnits="userSpaceOnUse">
        <rect width="5" height="5" fill="var(--paper, #FDFDF8)" />
        <circle cx="2.5" cy="2.5" r="1.4" fill="currentColor" />
      </pattern>
    </defs>
  );
}

function Frame({
  id,
  title,
  source,
  height,
  children,
}: {
  id: string;
  title: string;
  source: string;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <svg
      id={id}
      viewBox={`0 0 ${W} ${height}`}
      width="100%"
      role="img"
      aria-labelledby={`${id}-title`}
      className="h-auto text-ink"
      xmlns="http://www.w3.org/2000/svg"
      fontFamily="ui-sans-serif, system-ui, sans-serif"
    >
      <title id={`${id}-title`}>{title}</title>
      <Defs />
      <rect width={W} height={height} fill="var(--paper, #FDFDF8)" />
      <text x={PAD} y={26} fontSize="15" fontWeight="600" fill="currentColor">
        {title.length > 80 ? `${title.slice(0, 79)}…` : title}
      </text>
      {children}
      <text x={PAD} y={height - 12} fontSize="10" fill="currentColor" opacity="0.65">
        {source.length > 110 ? `${source.slice(0, 109)}…` : source}
      </text>
    </svg>
  );
}

function Legend({ series, y }: { series: ResolvedSeries[]; y: number }) {
  if (series.length < 2) return null;
  return (
    <g>
      {series.map((s, i) => (
        <g key={s.key} transform={`translate(${PAD + i * 156}, ${y})`}>
          <rect width="14" height="10" fill={FILLS[i]} stroke="currentColor" strokeWidth="1" />
          <text x="20" y="9" fontSize="10" fill="currentColor">
            {s.label.length > 24 ? `${s.label.slice(0, 23)}…` : s.label}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Horizontal bars: one label line, then one bar per series, value at the bar's end. */
export function BarChart({ id, title, source, series, lines }: ChartProps) {
  const max = maxValue(lines) || 1;
  const legend = series.length > 1 ? 18 : 0;
  const rowH = LABEL_H + series.length * (BAR_H + 3) + ROW_GAP;
  const height = HEAD_H + legend + lines.length * rowH + FOOT_H;
  const plotW = W - PAD * 2 - 72;
  return (
    <Frame id={id} title={title} source={source} height={height}>
      <Legend series={series} y={HEAD_H - 8} />
      {lines.map((l, r) => {
        const y0 = HEAD_H + legend + r * rowH;
        return (
          <g key={l.id}>
            <text x={PAD} y={y0 + 12} fontSize="12" fill="currentColor">
              {l.label.length > 70 ? `${l.label.slice(0, 69)}…` : l.label}
            </text>
            {l.cells.map((c, i) => {
              if (c.value === null) return null;
              const w = Math.max(1, (Number(c.value) / max) * plotW);
              const y = y0 + LABEL_H + i * (BAR_H + 3);
              return (
                <g key={i}>
                  <rect x={PAD} y={y} width={w} height={BAR_H} fill={FILLS[i]} stroke="currentColor" strokeWidth={i === 0 ? 0 : 1} opacity={i === 0 ? 0.85 : 1} />
                  <text x={PAD + w + 6} y={y + BAR_H - 3} fontSize="11" fill="currentColor">
                    {fmt(series[i], c.value)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </Frame>
  );
}

/** One bar per row, segments per series (same document kind only — the API refuses the rest). */
export function StackedBarChart({ id, title, source, series, lines }: ChartProps) {
  const max = maxStack(lines) || 1;
  const rowH = LABEL_H + BAR_H + ROW_GAP;
  const height = HEAD_H + 18 + lines.length * rowH + FOOT_H;
  const plotW = W - PAD * 2 - 72;
  return (
    <Frame id={id} title={title} source={source} height={height}>
      <Legend series={series} y={HEAD_H - 8} />
      {lines.map((l, r) => {
        const y0 = HEAD_H + 18 + r * rowH;
        let x = PAD;
        const sum = l.cells.reduce((a, c) => a + Number(c.value ?? 0), 0);
        return (
          <g key={l.id}>
            <text x={PAD} y={y0 + 12} fontSize="12" fill="currentColor">
              {l.label.length > 70 ? `${l.label.slice(0, 69)}…` : l.label}
            </text>
            {l.cells.map((c, i) => {
              const w = (Number(c.value ?? 0) / max) * plotW;
              const seg = (
                <rect key={i} x={x} y={y0 + LABEL_H} width={w} height={BAR_H} fill={FILLS[i]} stroke="currentColor" strokeWidth="1" opacity={i === 0 ? 0.85 : 1} />
              );
              x += w;
              return seg;
            })}
            <text x={x + 6} y={y0 + LABEL_H + BAR_H - 3} fontSize="11" fill="currentColor">
              {fmt(series[0], String(sum))}
            </text>
          </g>
        );
      })}
    </Frame>
  );
}

function Marker({ kind, x, y }: { kind: (typeof MARKERS)[number]; x: number; y: number }) {
  switch (kind) {
    case 'circle':
      return <circle cx={x} cy={y} r="4" fill="currentColor" />;
    case 'square':
      return <rect x={x - 4} y={y - 4} width="8" height="8" fill="var(--paper, #FDFDF8)" stroke="currentColor" strokeWidth="1.5" />;
    case 'triangle':
      return <path d={`M${x},${y - 5} L${x + 5},${y + 4} L${x - 5},${y + 4} Z`} fill="currentColor" />;
    case 'diamond':
      return <path d={`M${x},${y - 5} L${x + 5},${y} L${x},${y + 5} L${x - 5},${y} Z`} fill="var(--paper, #FDFDF8)" stroke="currentColor" strokeWidth="1.5" />;
  }
}

/** Years across, one line per series, every point labelled with its value. */
export function LineChart({ id, title, source, series, lines }: ChartProps) {
  const max = maxValue(lines) || 1;
  const plotTop = HEAD_H + 24;
  const plotH = 220;
  const height = plotTop + plotH + 30 + FOOT_H;
  const left = PAD + 8;
  const right = W - PAD - 8;
  const step = lines.length > 1 ? (right - left) / (lines.length - 1) : 0;
  const xAt = (i: number) => (lines.length > 1 ? left + i * step : (left + right) / 2);
  const yAt = (v: number) => plotTop + plotH - (v / max) * plotH;
  return (
    <Frame id={id} title={title} source={source} height={height}>
      <Legend series={series} y={HEAD_H - 8} />
      <line x1={left} x2={right} y1={plotTop + plotH} y2={plotTop + plotH} stroke="currentColor" opacity="0.3" />
      {lines.map((l, i) => (
        <text key={l.id} x={xAt(i)} y={plotTop + plotH + 18} fontSize="11" textAnchor="middle" fill="currentColor">
          {l.label}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = lines
          .map((l, i) => (l.cells[si].value === null ? null : { x: xAt(i), y: yAt(Number(l.cells[si].value)), v: l.cells[si].value! }))
          .filter((p) => p !== null);
        return (
          <g key={s.key}>
            <polyline
              points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray={si === 0 ? undefined : si === 1 ? '6 4' : si === 2 ? '2 3' : '10 3 2 3'}
            />
            {pts.map((p, i) => (
              <g key={i}>
                <Marker kind={MARKERS[si]} x={p.x} y={p.y} />
                <text x={p.x} y={p.y - 9 - si * 12} fontSize="10" textAnchor="middle" fill="currentColor">
                  {fmt(s, p.v)}
                </text>
              </g>
            ))}
          </g>
        );
      })}
    </Frame>
  );
}

export interface ChartProps {
  id: string;
  title: string;
  source: string;
  series: ResolvedSeries[];
  lines: Line[];
}
