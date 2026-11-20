/**
 * "Explain this chart" (specs/018 P2). A native <details>: opt-in, works with
 * no JavaScript, and a screen reader reads the text straight after the button
 * that opened it. The sentences come from `lib/explore/explain.ts`; this only
 * renders them, figures as links to their table rows.
 */
import { rich } from '@/i18n/rich';
import type { MessageKey } from '@/i18n/t';
import type { Explanation, Sentence } from '@/lib/explore/explain';
import { ExplainFeedback } from './feedback';

type T = (key: MessageKey, vars?: Record<string, string | number>) => string;

function Line({ s, t }: { s: Sentence; t: T }) {
  const nodes = Object.fromEntries(
    Object.entries(s.figures).map(([slot, f]) => [
      slot,
      f.href ? (
        <a href={f.href} className="font-semibold tabular-nums underline decoration-ink/30 underline-offset-2 hover:decoration-ink">{f.text}</a>
      ) : (
        <strong className="tabular-nums">{f.text}</strong>
      ),
    ]),
  );
  return <>{rich(t(s.key as MessageKey, s.vars), nodes)}</>;
}

export function ExplainPanel({ explanation: e, view, t }: { explanation: Explanation; view: string; t: T }) {
  return (
    <details className="group rounded-md border border-rule bg-paper-raised">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">›</span>
        {t('explore.explain.button')}
      </summary>
      <div className="space-y-4 border-t border-rule px-4 py-4 text-ink">
        <p className="text-base font-medium"><Line s={e.headline} t={t} /></p>
        {e.bullets.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {e.bullets.map((b, i) => <li key={i}><Line s={b} t={t} /></li>)}
          </ul>
        )}
        <div className="space-y-1 text-sm">
          <h3 className="font-medium">{t('explore.explain.limitsHeading')}</h3>
          {e.limits.map((l, i) => <p key={i} className="text-ink-muted"><Line s={l} t={t} /></p>)}
        </div>
        <div className="space-y-1 text-sm">
          <h3 className="font-medium">{t('explore.explain.sources')}</h3>
          <ol className="list-decimal pl-5 text-ink-muted">
            {e.sources.map((src) => (
              <li key={src.label}>{src.href ? <a href={src.href} className="underline underline-offset-2">{src.label}</a> : src.label}</li>
            ))}
          </ol>
        </div>
        <p className="text-xs text-ink-faint">{t('explore.explain.footer')}</p>
        <ExplainFeedback view={view} />
      </div>
    </details>
  );
}
