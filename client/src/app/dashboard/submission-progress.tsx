'use client';

import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DrawerTabs, DrawerTabPanel } from '@/components/aip/drawer-tabs';
import { SimpleSelect } from '@/components/custom/simple-select';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import type { DashboardOfficeRow, DashboardSummary } from '@/lib/api';

type Tab = 'cluster' | 'office';

function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * Zero-submission offices are collapsed by default.
 *
 * They matter — an office that has submitted nothing is the thing worth acting
 * on — but there are 54 of them against 8 active ones on the FY2027 cycle, so
 * listing them inline buries the offices that *have* moved under three screens
 * of greyed-out rows. The count stays visible; the names are one click away.
 */
function OfficeTable({ rows }: { rows: DashboardOfficeRow[] }) {
  const [showEmpty, setShowEmpty] = useState(false);

  const active = rows.filter((r) => r.total > 0);
  const empty = rows.filter((r) => r.total === 0);
  const visible = showEmpty ? [...active, ...empty] : active;

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-400">
        No offices match this filter.
      </p>
    );
  }

  if (active.length === 0 && !showEmpty) {
    return (
      <div className="py-4 text-center">
        <p className="text-sm text-neutral-400">
          No submissions from any of these {empty.length} office
          {empty.length === 1 ? '' : 's'} yet.
        </p>
        <button
          type="button"
          onClick={() => setShowEmpty(true)}
          className="mt-1 text-xs font-medium text-blue-600 hover:underline"
        >
          List them
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-left">
            <th className="pb-2 text-xs font-medium uppercase tracking-wider text-neutral-500">
              Office
            </th>
            <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-neutral-500">
              Drafts
            </th>
            <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-neutral-500">
              Published
            </th>
            <th className="pb-2 text-center text-xs font-medium uppercase tracking-wider text-neutral-500">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-50">
          {visible.map((row) => {
            const isEmpty = row.total === 0;
            return (
              <tr
                key={row.officeId}
                className={cn(isEmpty && 'text-neutral-300')}
              >
                <td className="py-2 pr-4">
                  <span
                    className={cn(
                      'font-medium',
                      isEmpty ? 'text-neutral-400' : 'text-neutral-800',
                    )}
                  >
                    {row.acronym}
                  </span>
                  <span className="ml-1.5 hidden text-xs text-neutral-400 sm:inline">
                    {row.name}
                  </span>
                </td>
                <td className="py-2 text-center tabular-nums">{row.drafts}</td>
                <td
                  className={cn(
                    'py-2 text-center font-medium tabular-nums',
                    row.published > 0 ? 'text-emerald-700' : '',
                  )}
                >
                  {row.published}
                </td>
                <td className="py-2 text-center tabular-nums">{row.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {empty.length > 0 && (
        <button
          type="button"
          aria-expanded={showEmpty}
          onClick={() => setShowEmpty(!showEmpty)}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline"
        >
          {showEmpty ? 'Hide' : 'Show'} {empty.length} office
          {empty.length === 1 ? '' : 's'} with no submissions
        </button>
      )}
    </div>
  );
}

export function SubmissionProgress({
  byCluster,
}: {
  byCluster: DashboardSummary['byCluster'];
}) {
  const [tab, setTab] = useState<Tab>('cluster');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clusterFilter, setClusterFilter] = useState('all');

  const clusterOptions = useMemo(
    () => [
      { value: 'all', label: 'All clusters' },
      ...byCluster.map((c) => ({
        value: c.clusterId,
        label: c.name,
        hint: `${c.officeCount} office${c.officeCount === 1 ? '' : 's'}`,
      })),
    ],
    [byCluster],
  );

  const officeRows = useMemo(() => {
    const source =
      clusterFilter === 'all'
        ? byCluster
        : byCluster.filter((c) => c.clusterId === clusterFilter);
    return source
      .flatMap((c) => c.offices)
      .sort((a, b) => b.total - a.total || a.acronym.localeCompare(b.acronym));
  }, [byCluster, clusterFilter]);

  if (byCluster.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-neutral-400">
        No active offices configured.
      </p>
    );
  }

  return (
    <div className="-mx-4 sm:-mx-6">
      <DrawerTabs<Tab>
        tabs={[
          { value: 'cluster', label: 'By cluster' },
          { value: 'office', label: 'By office' },
        ]}
        value={tab}
        onChange={setTab}
        idPrefix="submission-progress"
        className="border-t-0"
      />

      <div className="px-4 pt-4 sm:px-6">
        <DrawerTabPanel
          idPrefix="submission-progress"
          value="cluster"
          active={tab === 'cluster'}
        >
          <ul className="divide-y divide-neutral-50">
            {byCluster.map((c) => {
              const percent = pct(c.officesWithPublished, c.officeCount);
              const open = expanded === c.clusterId;
              return (
                <li key={c.clusterId}>
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setExpanded(open ? null : c.clusterId)}
                    className="flex w-full items-center gap-3 py-3 text-left hover:bg-neutral-50"
                  >
                    <ChevronRight
                      aria-hidden
                      className={cn(
                        'size-4 shrink-0 text-neutral-400 transition-transform',
                        open && 'rotate-90',
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-800">
                      {c.name}
                    </span>
                    <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                      {c.officesWithPublished}/{c.officeCount} offices
                    </span>
                    <Progress
                      value={percent}
                      className="h-1.5 w-20 shrink-0 sm:w-32"
                    />
                    <span className="w-9 shrink-0 text-right text-xs tabular-nums text-neutral-400">
                      {percent}%
                    </span>
                  </button>
                  {open && (
                    <div className="pb-3 pl-7">
                      <OfficeTable rows={c.offices} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="pt-3 text-xs text-neutral-400">
            A cluster&rsquo;s percentage is the share of its offices with at
            least one published program.
          </p>
        </DrawerTabPanel>

        <DrawerTabPanel
          idPrefix="submission-progress"
          value="office"
          active={tab === 'office'}
        >
          <div className="mb-3">
            <SimpleSelect
              options={clusterOptions}
              value={clusterFilter}
              onChange={setClusterFilter}
              size="sm"
              aria-label="Filter offices by cluster"
              className="w-full sm:w-64"
            />
          </div>
          <OfficeTable rows={officeRows} />
        </DrawerTabPanel>
      </div>
    </div>
  );
}
