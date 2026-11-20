import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { apiGetExplorerLog, apiGetExplorerSpend, type ExplorerSpend } from '@/lib/api';
import { EXPLORER_ENABLED, viewHref } from '@/lib/explore/view-url';
import { getSession, hasPermission } from '@/lib/session';

const ANSWERED_BY = ['model', 'cache', 'card', 'refused', 'resting', 'template'] as const;
const LANGS = ['en', 'fil', 'bcl'] as const;
const PAGE_SIZE = 50;

/**
 * Staff read of what residents asked the Data Explorer and how it answered
 * (specs/018 T032, R15/R16). Personal data: the question text is what a visitor
 * typed, so the page needs `explorer:read-log` and shows no device or IP.
 */
export default async function ExplorerLogPage({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string; answeredBy?: string; page?: string }>;
}) {
  if (!EXPLORER_ENABLED) notFound();
  const session = await getSession();
  if (!session) redirect('/login');
  if (!hasPermission(session.user, 'explorer:read-log'))
    return <p className="text-sm text-neutral-600">You need the “Read the Data Explorer question log” permission to see this page.</p>;

  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = {
    lang: (LANGS as readonly string[]).includes(sp.lang ?? '') ? sp.lang : undefined,
    answeredBy: (ANSWERED_BY as readonly string[]).includes(sp.answeredBy ?? '') ? sp.answeredBy : undefined,
  };
  const [{ items, total }, spend] = await Promise.all([
    apiGetExplorerLog(session.accessToken, { ...filter, page }).catch(() => ({ items: [], total: 0 })),
    apiGetExplorerSpend(session.accessToken).catch(() => null),
  ]);
  const href = (over: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...filter, page: 1, ...over })) if (v !== undefined && v !== '') q.set(k, String(v));
    return `/control-panel/explorer-log?${q}`;
  };
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-xs font-medium ${active ? 'bg-blue-600 text-white' : 'bg-white text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-100'}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">Explorer questions</h1>
        <p className="mt-1 text-sm text-neutral-500">
          What residents asked on Explore, how it was answered, and their verdicts. {total} in all. Question text is erased after 12 months.
        </p>
      </div>

      {spend && <Spend spend={spend} />}

      <div className="flex flex-wrap items-center gap-2">
        <Link href={href({ answeredBy: undefined })} className={chip(!filter.answeredBy)}>All answers</Link>
        {ANSWERED_BY.map((a) => (
          <Link key={a} href={href({ answeredBy: a })} className={chip(filter.answeredBy === a)}>{a}</Link>
        ))}
        <span className="mx-2 h-4 w-px bg-neutral-300" />
        <Link href={href({ lang: undefined })} className={chip(!filter.lang)}>All languages</Link>
        {LANGS.map((l) => (
          <Link key={l} href={href({ lang: l })} className={chip(filter.lang === l)}>{l}</Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs uppercase text-neutral-500">
            <tr>
              <th scope="col" className="px-3 py-2">When</th>
              <th scope="col" className="px-3 py-2">Question</th>
              <th scope="col" className="px-3 py-2">Answered by</th>
              <th scope="col" className="px-3 py-2">Chart</th>
              <th scope="col" className="px-3 py-2">Verdicts</th>
              <th scope="col" className="px-3 py-2">Model calls</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-6 text-center text-neutral-500">No questions yet.</td></tr>
            )}
            {items.map((i) => (
              <tr key={i.id} className="border-b border-neutral-100 align-top">
                <td className="whitespace-nowrap px-3 py-2 text-neutral-500">
                  {new Date(i.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
                  <span className="ml-1 text-xs uppercase">{i.lang}</span>
                </td>
                <td className="max-w-xs px-3 py-2 text-neutral-900">
                  {i.text ?? <span className="text-neutral-400">{i.answeredBy === 'template' ? 'Explain (no question)' : 'not kept'}</span>}
                </td>
                <td className="px-3 py-2">
                  {i.answeredBy}
                  {i.refusal && <span className="block text-xs text-neutral-500">{i.refusal}</span>}
                </td>
                <td className="px-3 py-2">
                  {i.view ? <a href={viewHref(i.view)} target="_blank" rel="noreferrer" className="text-blue-700 underline">open</a> : '—'}
                </td>
                <td className="px-3 py-2">
                  {i.feedback.length === 0 ? '—' : i.feedback.map((f, n) => (
                    <span key={n} className="block">{f.verdict}{f.reason ? ` · ${f.reason}` : ''}{f.text ? ` — “${f.text}”` : ''}</span>
                  ))}
                </td>
                <td className="px-3 py-2 text-xs text-neutral-600">
                  {i.calls.length === 0 ? '—' : i.calls.map((c, n) => (
                    <details key={n}>
                      <summary className="cursor-pointer">{c.ok ? '✓' : '✗'} {c.model} · {c.latencyMs} ms</summary>
                      <pre className="mt-1 max-w-md whitespace-pre-wrap break-words text-[11px]">{c.rawOutput ?? ''}</pre>
                    </details>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 text-sm">
        {page > 1 && <Link href={href({ page: page - 1 })} className="underline">← Newer</Link>}
        {page * PAGE_SIZE < total && <Link href={href({ page: page + 1 })} className="underline">Older →</Link>}
      </div>
    </div>
  );
}

const usd = (n: number) => `US$${n.toFixed(n < 1 ? 3 : 2)}`;

/** Model spend per day (W7): what the daily budget is being spent on, so the cap can be tuned. */
function Spend({ spend }: { spend: ExplorerSpend }) {
  const days = [...new Set([...spend.calls.map((c) => c.day), ...spend.answers.map((a) => a.day)])].sort().reverse();
  const sum = (day: string, kind?: string) => spend.calls.filter((c) => c.day === day && (!kind || c.kind === kind)).reduce((a, c) => a + c.usd, 0);
  const n = (day: string, kind: string) => spend.calls.filter((c) => c.day === day && c.kind === kind).reduce((a, c) => a + c.calls, 0);
  const answered = (day: string, by?: string) => spend.answers.filter((a) => a.day === day && (!by || a.answeredBy === by)).reduce((a, x) => a + x.n, 0);
  const total = spend.calls.reduce((a, c) => a + c.usd, 0);
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-3" data-testid="explorer-spend">
      <h2 className="text-sm font-semibold text-neutral-900">Model spend, last 30 days: {usd(total)}</h2>
      <p className="mt-0.5 text-xs text-neutral-500">
        At today&apos;s prices (US${spend.prices.in} in / US${spend.prices.out} out per million tokens). Labelling runs are outside the chat&apos;s daily budget. Models:{' '}
        {[...new Set(spend.calls.map((c) => c.model))].join(', ') || '—'}.
      </p>
      {days.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">No model calls yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th scope="col" className="px-2 py-1">Day (UTC)</th>
                <th scope="col" className="px-2 py-1 text-right">Chat + Ask</th>
                <th scope="col" className="px-2 py-1 text-right">Calls</th>
                <th scope="col" className="px-2 py-1 text-right">Labelling</th>
                <th scope="col" className="px-2 py-1 text-right">Questions</th>
                <th scope="col" className="px-2 py-1 text-right">From cache</th>
                <th scope="col" className="px-2 py-1 text-right">Resting</th>
              </tr>
            </thead>
            <tbody>
              {days.map((d) => (
                <tr key={d} className="border-t border-neutral-100">
                  <td className="px-2 py-1 text-neutral-700">{d}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{usd(sum(d) - sum(d, 'label'))}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{n(d, 'chat') + n(d, 'ask')}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{n(d, 'label') ? `${usd(sum(d, 'label'))} · ${n(d, 'label')} calls` : '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{answered(d)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{answered(d) ? `${Math.round((100 * answered(d, 'cache')) / answered(d))}%` : '—'}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{answered(d, 'resting') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
