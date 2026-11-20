'use client';

import { messageVars, type Brand } from '@/lib/brand';
import { useBrand } from './brand-provider';

type TextField = Exclude<keyof Brand, 'type' | 'sealSrc' | 'palette' | 'website' | 'address' | 'budgetArchive' | 'slug' | 'contactEmail' | 'contactPhone' | 'legalEffective'>;

/** The LGU's government, linked to its own website when one is configured. */
export function GovernmentLink({ className }: { className?: string }) {
  const { government, website } = useBrand();
  if (!website) return <>{government}</>;
  return (
    <a href={website} target="_blank" rel="noopener noreferrer" className={className}>
      {government}
    </a>
  );
}

/** One of the portal's names, as text — usable from server and client components alike. */
export function BrandText({ field, possessive }: { field: TextField; possessive?: boolean }) {
  const value = useBrand()[field];
  return <>{possessive ? `${value}’s` : value}</>;
}

/**
 * A word that follows `LGU_TYPE`, for copy written in a component rather than a message:
 * "the <LguWord k="lgu" />’s share". English only; messages use the `{lgu}` slots instead.
 */
export function LguWord({ k }: { k: 'lgu' | 'Lgu' | 'lguAdj' | 'LguAdj' | 'council' | 'Mayor' }) {
  return <>{messageVars(useBrand())[k]}</>;
}
