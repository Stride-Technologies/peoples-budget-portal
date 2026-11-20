'use client';

import Link from 'next/link';
import type { ComponentProps } from 'react';
import { useLocale } from '@/i18n/locale-provider';
import { localizedPath } from '@/i18n/locales';

/**
 * `next/link` that keeps the visitor in their language (specs/014 SC-004):
 * `/learn` becomes `/bcl/learn` on a Bikol page. External URLs, anchors and the
 * staff app pass through unchanged (`localizedPath`).
 */
export function LocaleLink({ href, ...props }: ComponentProps<typeof Link>) {
  const locale = useLocale();
  const target = typeof href === 'string' ? localizedPath(locale, href) : href;
  return <Link href={target} {...props} />;
}
