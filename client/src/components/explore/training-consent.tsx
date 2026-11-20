'use client';

/**
 * "Help improve" (specs/020 B4, decision 4): a resident may let the city keep a
 * question to train its model. Shown only where the LGU switched capture on
 * (`capabilities.trainingCapture`), unticked by default, never remembered
 * beyond this tab. The API still drops the question unless the privacy notice
 * is set and the scrubber finds no name or contact.
 */
import { LocaleLink } from '@/components/i18n/locale-link';
import { useT } from '@/i18n/locale-provider';

export function TrainingConsent({ id, checked, onChange, className }: { id: string; checked: boolean; onChange: (v: boolean) => void; className?: string }) {
  const t = useT();
  return (
    <div className={`flex items-start gap-2 text-xs text-ink-muted ${className ?? ''}`} data-testid="training-consent">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current" />
      <label htmlFor={id}>
        {t('explore.consent.label')}{' '}
        <LocaleLink href="/privacy-policy" className="underline underline-offset-2">
          {t('explore.consent.privacy')}
        </LocaleLink>
      </label>
    </div>
  );
}
