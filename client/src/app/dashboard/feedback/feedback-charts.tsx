'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { LguFeedbackAnalytics } from '@/lib/api';


function formatMonth(month: string) {
  const [year, m] = month.split('-');
  const d = new Date(Number(year), Number(m) - 1, 1);
  return d.toLocaleDateString('en-PH', { month: 'short', year: '2-digit' });
}

function truncate(str: string, n: number) {
  return str.length > n ? str.slice(0, n) + '…' : str;
}

export default function FeedbackCharts({
  analytics,
}: {
  analytics: LguFeedbackAnalytics;
}) {
  const { totalCount, unreviewedCount, topPrograms, byMonth } = analytics;

  const reviewedCount = totalCount - unreviewedCount;
  const busiestMonth =
    byMonth.length > 0
      ? byMonth.reduce((a, b) => (b.count > a.count ? b : a))
      : null;
  const topProgram = topPrograms[0] ?? null;

  const monthData = (() => {
    if (byMonth.length === 0) return [];
    const countByMonth = new Map(byMonth.map((d) => [d.month, d.count]));
    const sorted = [...byMonth].sort((a, b) => a.month.localeCompare(b.month));
    const [startYear, startMo] = sorted[0].month.split('-').map(Number);
    const [endYear, endMo] = sorted[sorted.length - 1].month.split('-').map(Number);
    const result: { month: string; count: number; label: string }[] = [];
    let y = startYear, m = startMo;
    while (y < endYear || (y === endYear && m <= endMo)) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      result.push({ month: key, count: countByMonth.get(key) ?? 0, label: formatMonth(key) });
      if (m === 12) { y++; m = 1; } else { m++; }
    }
    return result;
  })();

  const topProgramsData = topPrograms.map((p) => ({
    ...p,
    label: truncate(p.name, 28),
  }));

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Feedback" value={totalCount} />
        <StatCard
          label="Unreviewed"
          value={unreviewedCount}
          sub={totalCount > 0 ? `${reviewedCount} reviewed` : undefined}
          highlight={unreviewedCount > 0}
        />
        <StatCard
          label="Most Active Program"
          value={topProgram ? topProgram.count : 0}
          sub={topProgram ? truncate(topProgram.name, 24) : 'None'}
        />
        <StatCard
          label="Busiest Month"
          value={busiestMonth ? busiestMonth.count : 0}
          sub={busiestMonth ? formatMonth(busiestMonth.month) : 'None'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly trend */}
        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">
            Feedback Over Time
          </h3>
          {monthData.length === 0 ? (
            <p className="text-sm text-neutral-400 py-8 text-center">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                data={monthData}
                margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}
                  cursor={{ fill: '#f9fafb' }}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Feedback" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top programs */}
        <div className="rounded-lg border border-neutral-200 p-4">
          <h3 className="text-sm font-medium text-neutral-700 mb-4">
            Top Programs by Feedback
          </h3>
          {topProgramsData.length === 0 ? (
            <p className="text-sm text-neutral-400 py-8 text-center">
              No data
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart
                layout="vertical"
                data={topProgramsData}
                margin={{ top: 0, right: 24, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tick={{ fontSize: 10, fill: '#6b7280' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #e5e7eb',
                  }}
                  cursor={{ fill: '#f9fafb' }}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 3, 3, 0]} name="Feedback" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${highlight ? 'text-amber-600' : 'text-neutral-900'}`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
