'use client';

import Image from 'next/image';
import { monogram } from '@/lib/brand';
import { paletteById } from '@/lib/palettes';
import { cn } from '@/lib/utils';
import { useBrand } from './brand-provider';

/** The LGU's seal (`LGU_SEAL_SRC`), or a monogram of its initials in the site's colour. */
export function Seal({ size = 40, priority, className }: { size?: number; priority?: boolean; className?: string }) {
  const brand = useBrand();
  const box = cn('shrink-0 object-contain', className);
  if (brand.sealSrc) {
    return <Image src={brand.sealSrc} alt={brand.sealAlt} width={size} height={size} priority={priority} className={box} />;
  }
  const fill = paletteById(brand.palette).primary;
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} role="img" aria-label={brand.sealAlt} className={box}>
      <circle cx="20" cy="20" r="19" fill={fill} />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="#FFFFFF" strokeOpacity="0.55" strokeWidth="1" />
      <text x="20" y="20" textAnchor="middle" dominantBaseline="central" fill="#FFFFFF" fontSize="14" fontWeight="700" fontFamily="var(--font-heading), sans-serif">
        {monogram(brand.shortName)}
      </text>
    </svg>
  );
}
