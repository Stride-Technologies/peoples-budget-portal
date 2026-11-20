'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Locale } from './locales';
import { translator } from './t';
import { useBrand } from '@/components/brand/brand-provider';
import { messageVars } from '@/lib/brand';

const LocaleContext = createContext<Locale>('en');

/** Set once in the root layout from `getLocale()`; client components read it. */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** `const t = useT()` in a client component. */
export function useT() {
  const locale = useLocale();
  const brand = useBrand();
  return useMemo(() => translator(locale, messageVars(brand, locale)), [locale, brand]);
}
