'use client';

import { useState } from 'react';
import { sendExplainFeedback } from '@/app/(public)/explore/_actions';
import { useLocale, useT } from '@/i18n/locale-provider';
import type { MessageKey } from '@/i18n/t';
import { deviceKey } from '@/lib/explore/device-key';

const REASONS = ['wrong-year', 'wrong-office', 'wrong-number', 'wrong-language', 'not-understood', 'other'] as const;
type Verdict = 'correct' | 'wrong' | 'unsure';

/** Right / wrong / not sure under an explanation or an Ask answer, with a reason when wrong (R16). */
export function ExplainFeedback({ view, recordId, question = 'explore.feedback.question' }: { view?: string; recordId?: string; question?: MessageKey }) {
  const t = useT();
  const lang = useLocale();
  const [state, setState] = useState<'ask' | 'why' | 'sending' | 'sent' | 'failed'>('ask');

  async function send(verdict: Verdict, reason?: string) {
    setState('sending');
    const target = recordId ? { recordId } : { view: view!, lang };
    const { ok } = await sendExplainFeedback({ ...target, verdict, reason, deviceKey: deviceKey() });
    setState(ok ? 'sent' : 'failed');
  }

  const chip = 'min-h-11 rounded-full border border-rule bg-paper-raised px-4 text-sm text-ink hover:bg-paper-tint disabled:opacity-50';
  if (state === 'sent' || state === 'failed')
    return <p role="status" className="text-sm text-ink-muted">{t(state === 'sent' ? 'explore.feedback.thanks' : 'explore.feedback.failed')}</p>;

  return (
    <fieldset className="space-y-2" disabled={state === 'sending'}>
      <legend className="text-sm text-ink">{t(state === 'why' ? 'explore.feedback.why' : question)}</legend>
      <div className="flex flex-wrap gap-2">
        {state === 'why'
          ? REASONS.map((r) => (
              <button key={r} type="button" className={chip} onClick={() => send('wrong', r)}>
                {t(`explore.feedback.reason.${r}` as MessageKey)}
              </button>
            ))
          : (
            <>
              <button type="button" className={chip} onClick={() => send('correct')}>{t('explore.feedback.correct')}</button>
              <button type="button" className={chip} onClick={() => setState('why')}>{t('explore.feedback.wrong')}</button>
              <button type="button" className={chip} onClick={() => send('unsure')}>{t('explore.feedback.unsure')}</button>
            </>
          )}
      </div>
    </fieldset>
  );
}
