'use client';

import { MessageSquare, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/currency-formatter';
import type { PublicProgramItem } from '@/lib/api';

function FinishLineBadge({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
      {name}
    </span>
  );
}

function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

interface PublicProgramCardProps {
  item: PublicProgramItem;
  onViewProgram: (id: string) => void;
}

export function PublicProgramCard({ item, onViewProgram }: PublicProgramCardProps) {
  const implementingOffice = item.office
    ? item.office.acronym
      ? `${item.office.acronym} — ${item.office.name}`
      : item.office.name
    : null;

  return (
    <button
      type="button"
      onClick={() => onViewProgram(item.id)}
      className="group flex w-full flex-col rounded-xl border border-slate-200 bg-white text-left shadow-sm transition-all hover:border-blue-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      {/* Top: badges */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pt-4">
        {item.finishLine && <FinishLineBadge name={item.finishLine.name} />}
        {item.papSector && (
          <span className="inline-flex items-center rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
            {item.papSector.code}
          </span>
        )}
      </div>

      {/* Middle: name + office */}
      <div className="flex-1 px-4 py-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900 group-hover:text-blue-700">
          {item.name}
        </h3>
        {implementingOffice && (
          <p className="mt-1.5 text-xs font-medium text-slate-500">{implementingOffice}</p>
        )}
      </div>

      {/* Bottom: budget + meta */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
        <span className="text-sm font-bold tabular-nums text-slate-900">
          {formatCurrency(item.grandTotal)}
        </span>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          {item.lastUpdatedAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatRelative(item.lastUpdatedAt)}
            </span>
          )}
          {item.feedbackCount > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              {item.feedbackCount}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
