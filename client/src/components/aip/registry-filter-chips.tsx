'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VISIONS } from '@/lib/finish-lines';
import { goal, goals } from '@/lib/goal-label';


/**
 * The public registry's filter chips, extracted so the internal registry can use
 * the same interaction.
 *
 * Chips rather than dropdowns because the filter set is small, stable, and worth
 * seeing at a glance: a dropdown hides which finish lines even exist and costs a
 * click to find out. The public registry has worked this way; the staff registry
 * was still on comboboxes, so the two taught different mental models of the same
 * data.
 */

export interface FinishLineChip {
  id: string;
  name: string;
  shortName?: string | null;
  visionNumber?: number | null;
  /** The goal's own colour, when the caller has it; else the finish line's by number. */
  color?: string | null;
  /** Rendered as a count badge when the chip is active. */
  programCount?: number;
}

export interface ClusterChip {
  id: string;
  name: string;
}

function visionColor(visionNumber?: number | null): string {
  if (visionNumber == null) return '#64748b';
  return VISIONS.find((v) => v.id === visionNumber)?.color ?? '#64748b';
}

/**
 * Horizontally scrolling finish-line chips, coloured by vision.
 *
 * The row scrolls rather than wraps: eight finish lines with long names wrap to
 * three rows and push the table below the fold. Arrows and an edge fade appear
 * only when there is somewhere to scroll, so a short list looks like a plain row.
 */
export function FinishLineChips({
  finishLines,
  selected,
  onChange,
  allCount,
  label = `Browse PPAs per ${goal}`,
  solidAll = false,
  className,
}: Readonly<{
  finishLines: FinishLineChip[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** When given, renders a leading "All" chip carrying the unfiltered total. */
  allCount?: number;
  /** The row's heading — PPAs on the registries, plans on the PPMP section. */
  label?: string;
  /** A filled "All" chip when active, as the public AIP registry draws it. */
  solidAll?: boolean;
  className?: string;
}>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () =>
      setEdges({
        left: el.scrollLeft > 0,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      });
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [finishLines]);

  const maskImage = (() => {
    if (!edges.left && !edges.right) return undefined;
    const l = edges.left ? 'transparent' : 'black';
    const r = edges.right ? 'transparent' : 'black';
    return `linear-gradient(to right, ${l}, black 32px, black calc(100% - 32px), ${r})`;
  })();

  const scrollBy = (delta: number) =>
    scrollRef.current?.scrollBy({ left: delta, behavior: 'smooth' });

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-bold tracking-widest text-tbl-faint uppercase">
        {label}
      </p>
      <div className="flex items-center gap-1.5">
        {/* Pinned, outside the scroll region: "All" is how you clear the filter,
            so it must never be the thing that scrolled away. */}
        {allCount !== undefined && (
          <button
            type="button"
            onClick={() => onChange([])}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              selected.length === 0
                ? solidAll
                  ? 'border-primary bg-primary text-white'
                  : 'border-primary bg-primary/5 text-primary font-semibold'
                : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
            )}
          >
            All
            <span
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                selected.length === 0
                  ? solidAll
                    ? 'bg-tbl-surface/20 text-white'
                    : 'bg-primary/15 text-primary'
                  : 'bg-tbl-fill-strong text-tbl-muted-2',
              )}
            >
              {allCount}
            </span>
          </button>
        )}
        {allCount !== undefined && (
          <div className="h-4 w-px shrink-0 bg-tbl-fill-deep" aria-hidden="true" />
        )}

        <button
          type="button"
          aria-label={`Scroll ${goals} left`}
          aria-hidden={!edges.left || undefined}
          tabIndex={edges.left ? undefined : -1}
          onClick={() => scrollBy(-200)}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-tbl-rule bg-tbl-surface shadow-sm hover:bg-tbl-fill',
            !edges.left && 'hidden',
          )}
        >
          <ChevronLeft className="h-3.5 w-3.5 text-tbl-muted-2" />
        </button>

        <div
          ref={scrollRef}
          className="flex flex-1 gap-1.5 overflow-x-auto scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          style={{ maskImage, WebkitMaskImage: maskImage } as React.CSSProperties}
        >
          {finishLines.map((fl) => {
            const color = fl.color ?? visionColor(fl.visionNumber);
            const label =
              fl.shortName ?? fl.name;
            const isActive = selected.includes(fl.id);

            return (
              <button
                key={fl.id}
                type="button"
                onClick={(e) => {
                  onChange(isActive ? [] : [fl.id]);
                  e.currentTarget.scrollIntoView({
                    block: 'nearest',
                    inline: 'nearest',
                    behavior: 'smooth',
                  });
                }}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors"
                style={
                  isActive
                    ? {
                        backgroundColor: color + '18',
                        borderColor: color,
                        color,
                      }
                    : undefined
                }
              >
                {fl.visionNumber != null && (
                  <>
                    {/* Always on, not just when active — the point is to spot
                        a vision by colour before you've clicked anything. */}
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span
                      className="font-bold tabular-nums"
                      style={{
                        color: isActive ? color : '#94a3b8',
                        fontSize: '10px',
                      }}
                    >
                      {`#${fl.visionNumber}`}
                    </span>
                  </>
                )}
                <span className={cn(!isActive && 'text-tbl-muted')}>{label}</span>
                {isActive && fl.programCount !== undefined && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                    style={{ backgroundColor: color + '30', color }}
                  >
                    {fl.programCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label={`Scroll ${goals} right`}
          aria-hidden={!edges.right || undefined}
          tabIndex={edges.right ? undefined : -1}
          onClick={() => scrollBy(200)}
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-tbl-rule bg-tbl-surface shadow-sm hover:bg-tbl-fill',
            !edges.right && 'hidden',
          )}
        >
          <ChevronRight className="h-3.5 w-3.5 text-tbl-muted-2" />
        </button>
      </div>
    </div>
  );
}

/**
 * Cluster chips. Single-select — clicking the active one clears it, which is the
 * gesture people reach for before they find a "clear" control.
 */
export function ClusterChips({
  clusters,
  selected,
  onChange,
  className,
}: Readonly<{
  clusters: ClusterChip[];
  /** `'all'` for no filter, matching the registry's existing convention. */
  selected: string;
  onChange: (next: string) => void;
  className?: string;
}>) {
  if (clusters.length === 0) return null;

  return (
    <div className={className}>
      <p className="mb-2 text-[10px] font-bold tracking-widest text-tbl-faint uppercase">
        Clusters
      </p>
      <div className="flex flex-wrap gap-1.5">
        {clusters.map((c) => {
          const active = selected === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onChange(active ? 'all' : c.id)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-primary font-semibold'
                  : 'border-tbl-rule bg-tbl-surface text-tbl-muted hover:border-tbl-rule-strong hover:bg-tbl-fill',
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
