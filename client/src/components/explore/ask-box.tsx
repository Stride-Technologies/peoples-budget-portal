'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { askExplorer } from '@/app/(public)/explore/_actions';
import { LocaleLink } from '@/components/i18n/locale-link';
import { useLocale, useT } from '@/i18n/locale-provider';
import { localizedPath } from '@/i18n/locales';
import type { MessageKey } from '@/i18n/t';
import type { ExploreAskResult } from '@/lib/api';
import { consentField } from '@/lib/explore/consent';
import { deviceKey } from '@/lib/explore/device-key';
import { viewHref } from '@/lib/explore/view-url';
import { ExplainFeedback } from './feedback';
import { MicButton } from './mic-button';
import { TrainingConsent } from './training-consent';

type State =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'error'; reason: 'limit' | 'failed' }
  | { kind: 'answered'; r: ExploreAskResult };

/**
 * Ask (specs/018 P3, T034). One plain labelled text field — so phone voice
 * typing and screen readers work on it — and the answer is not a chat: it
 * rewrites the URL to a view, exactly as the controls below do, and says in
 * words what it understood and what it had to guess. Every control under it
 * still edits that view, so a guess is fixed by changing one menu, not by
 * asking again. The question itself is never put in the URL.
 */
export function AskBox({ micSeconds, training = false }: { micSeconds?: number; training?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const input = useRef<HTMLTextAreaElement>(null);
  const [q, setQ] = useState('');
  const [state, setState] = useState<State>({ kind: 'idle' });
  const [consent, setConsent] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = q.trim();
    if (!text || state.kind === 'working') return;
    setState({ kind: 'working' });
    const r = await askExplorer({ q: text, lang: locale, deviceKey: deviceKey(), ...consentField(training, consent) });
    if ('error' in r) return setState({ kind: 'error', reason: r.error });
    setState({ kind: 'answered', r });
    if (r.view) router.push(localizedPath(locale, viewHref(r.view)), { scroll: false });
  }

  function retry() {
    input.current?.focus();
    input.current?.select();
  }

  return (
    <section aria-labelledby="explore-ask" className="space-y-3">
      <form onSubmit={ask} className="space-y-2">
        <label htmlFor="explore-ask-input" id="explore-ask" className="block text-sm font-medium text-ink">
          {t('explore.ask.label')}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <textarea
            id="explore-ask-input"
            ref={input}
            rows={1}
            maxLength={300}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder={t('explore.ask.placeholder')}
            className="min-h-11 flex-1 resize-y rounded-md border border-rule bg-paper-raised px-3 py-2.5 text-base text-ink placeholder:text-ink-faint focus:border-ink/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!q.trim() || state.kind === 'working'}
            className="min-h-11 rounded-md bg-ink px-5 text-sm font-medium text-paper disabled:opacity-50"
          >
            {t('explore.ask.submit')}
          </button>
          {micSeconds !== undefined && (
            <MicButton
              maxSeconds={micSeconds}
              onText={(text) => {
                setQ(text);
                input.current?.focus();
              }}
            />
          )}
        </div>
        <p className="text-xs text-ink-faint">{t('explore.ask.hint')}</p>
        {training && <TrainingConsent id="explore-ask-consent" checked={consent} onChange={setConsent} />}
      </form>

      <div role="status" className="space-y-3 text-sm text-ink">
        {state.kind === 'working' && <p>{t('explore.ask.working')}</p>}
        {state.kind === 'error' && <p>{t(state.reason === 'limit' ? 'explore.ask.limit' : 'explore.ask.failed')}</p>}
        {state.kind === 'answered' && <Answer r={state.r} onRetry={retry} />}
      </div>
    </section>
  );
}

/** What Ask says about an answer; shared with the workspace's chat column. */
export function answerMessage(r: ExploreAskResult, t: ReturnType<typeof useT>, where: 'page' | 'workspace' = 'page'): { message: string; guessed: string[] } {
  const guessed = (r.guessed ?? []).map((g) => t(`explore.ask.guessed.${g}` as MessageKey)).filter((g) => !g.startsWith('explore.'));
  const notUnderstood = r.answeredBy === 'refused' && r.refusal === 'not-understood';
  let message: string;
  if (r.answeredBy === 'resting') message = t('explore.ask.resting');
  else if (notUnderstood) message = r.view ? t(where === 'page' ? 'explore.ask.nearest' : 'explore.ws.nearest') : t('explore.ask.notUnderstood');
  else if (r.answeredBy === 'refused') message = r.refusal ?? t('explore.ask.notUnderstood');
  else if (r.understood) message = t('explore.ask.understood', { understood: r.understood });
  else message = t(where === 'page' ? 'explore.ask.matched' : 'explore.ws.matched');
  return { message, guessed };
}

function Answer({ r, onRetry }: { r: ExploreAskResult; onRetry: () => void }) {
  const t = useT();
  const locale = useLocale();
  const { message, guessed } = answerMessage(r, t);

  return (
    <div className="space-y-3 rounded-md border border-rule bg-paper-tint px-4 py-3">
      <p>{message}</p>
      {guessed.length > 0 && (
        <p className="text-ink-muted">{t('explore.ask.guessedLine', { fields: guessed.join(', ') })}</p>
      )}
      {r.suggestions && r.suggestions.length > 0 && !r.view && (
        <ul className="flex flex-wrap gap-2">
          {r.suggestions.map((c) => (
            <li key={c.id}>
              <LocaleLink href={viewHref(c.view)} className="inline-flex min-h-11 items-center rounded-full border border-rule bg-paper-raised px-4 text-sm hover:bg-paper-deep">
                {c.question[locale as 'en' | 'fil' | 'bcl'] ?? c.question.en}
              </LocaleLink>
            </li>
          ))}
        </ul>
      )}
      {r.view && (
        <>
          <button type="button" onClick={onRetry} className="text-sm underline underline-offset-2">
            {t('explore.ask.notWhatYouMeant')}
          </button>
          {r.answeredBy !== 'resting' && <ExplainFeedback key={r.recordId} recordId={r.recordId} question="explore.ask.feedback" />}
        </>
      )}
    </div>
  );
}
