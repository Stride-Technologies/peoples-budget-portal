import { Archive } from 'lucide-react';
import { formatManilaDate } from '@/lib/manila-date';
import { LguWord } from '@/components/brand/brand-text';

/**
 * Shown on an archived program's public page (specs/013 FR-016): it was
 * superseded, so it no longer counts in any total, but its link, versions and
 * the feedback it already received stay readable.
 */
export function ArchivedNotice({
  archived,
}: {
  archived: { at: string; reason: string | null };
}) {
  return (
    <div className="mt-3 flex items-start gap-2 rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-800">
      <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-zinc-600" />
      <p>
        <span className="font-medium">Archived on {formatManilaDate(archived.at)}.</span>{' '}
        {archived.reason ? `${archived.reason}. ` : ''}
        It is no longer part of the <LguWord k="lgu" />&rsquo;s budget totals, and new feedback is
        closed. Earlier feedback is kept below.
      </p>
    </div>
  );
}
