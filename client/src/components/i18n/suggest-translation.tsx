'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { PublicRegistryFeedbackDialog } from '@/components/public/public-registry-feedback-dialog';
import { submitRegistryFeedback } from '@/app/(public)/budget/_actions';
import { useLocale, useT } from '@/i18n/locale-provider';
import { LOCALE_LABEL, splitLocale } from '@/i18n/locales';

/**
 * "Suggest a better translation" (specs/014 FR-009), on every page outside
 * English. It opens the site's public feedback form; the form has no page or
 * language field, so both lead the message, where the reviewing staff read it.
 */
export function SuggestTranslation({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const path = splitLocale(usePathname()).path;
  const [open, setOpen] = useState(false);
  if (locale === 'en') return null;

  const context = `[Translation · ${LOCALE_LABEL[locale]} · ${path}]\n`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
      >
        {t('lang.suggest')}
      </button>
      <PublicRegistryFeedbackDialog
        open={open}
        onOpenChange={setOpen}
        showCategory={false}
        subtitle={`${t('lang.suggest')} · ${LOCALE_LABEL[locale]}`}
        messagePlaceholder={t('lang.suggestPlaceholder')}
        onSubmit={(dto) =>
          submitRegistryFeedback({
            ...dto,
            category: 'OTHER',
            // ponytail: the API caps messages at 2000; the context costs the tail of a 2000-char note.
            message: (context + dto.message).slice(0, 2000),
          })
        }
      />
    </>
  );
}
