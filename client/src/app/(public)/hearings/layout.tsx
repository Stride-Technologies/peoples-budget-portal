import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getT } from '@/i18n/server';
import { HEARINGS_ENABLED } from '@/lib/hearings/config';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t('hearings.meta.title'),
    description: t('hearings.meta.description'),
    // Machine transcripts of named people: readable by anyone who comes, not offered to search engines.
    robots: { index: false, follow: false },
  };
}

/** The hearings pages exist only where a hearings API is configured (docs/modules/hearings.md). */
export default function HearingsLayout({ children }: { children: ReactNode }) {
  if (!HEARINGS_ENABLED) notFound();
  return children;
}
