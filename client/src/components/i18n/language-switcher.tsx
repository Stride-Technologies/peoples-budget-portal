'use client';

import { usePathname } from 'next/navigation';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { CheckIcon, ChevronDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useLocale, useT } from '@/i18n/locale-provider';
import {
  LOCALES,
  LOCALE_LABEL,
  LOCALE_TAG,
  isLiveLocale,
  localizedPath,
  splitLocale,
} from '@/i18n/locales';

/**
 * A small menu of the same page in each language (FR-005). Each language is
 * its own URL and the choice is never made automatically from the browser.
 * A language not yet signed off is absent in production (`isLiveLocale`).
 *
 * The items are plain anchors, not `next/link`: `/fil/x` is a rewrite of `/x`,
 * so the client router saw the same route, kept the page it had, and the
 * language never changed. `<html lang>` is set by the root layout, which a
 * soft navigation never re-renders either. A full load is the switch.
 */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  // Strip a prefix whether the hook reports the browser's URL or the rewritten
  // one. Query strings are not carried over: useSearchParams would force a
  // Suspense boundary on every page that renders the nav.
  const here = splitLocale(usePathname()).path;
  const live = LOCALES.filter((l) => isLiveLocale(l));
  if (live.length < 2) return null;

  return (
    <div className={cn('flex items-center', className)}>
      <DropdownMenu modal={false}>
        {/* The name holds the visible text ("Language: English"), so a voice-control
            user can say what they see (WCAG 2.5.3); an aria-label of "Language" did not. */}
        <DropdownMenuTrigger className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-ink-muted transition-colors hover:text-ink data-popup-open:text-ink">
          <span className="sr-only">{t('lang.label')}: </span>
          {LOCALE_LABEL[locale]}
          <ChevronDownIcon aria-hidden="true" className="size-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-28 rounded bg-paper p-1 ring-rule">
          {live.map((l) => (
            <MenuPrimitive.LinkItem
              key={l}
              href={localizedPath(l, here)}
              hrefLang={LOCALE_TAG[l]}
              lang={LOCALE_TAG[l]}
              aria-current={l === locale ? 'true' : undefined}
              className={cn(
                'flex items-center justify-between gap-3 rounded px-2 py-1.5 text-xs outline-hidden select-none data-highlighted:bg-paper-tint',
                l === locale ? 'font-medium text-ink' : 'text-ink-muted',
              )}
            >
              {LOCALE_LABEL[l]}
              {l === locale && <CheckIcon aria-hidden="true" className="size-3" />}
            </MenuPrimitive.LinkItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
