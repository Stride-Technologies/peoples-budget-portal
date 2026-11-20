'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { DEFAULT_BRAND, type Brand } from '@/lib/brand';

const BrandContext = createContext<Brand>(DEFAULT_BRAND);

/** Hands the server's `getBrand()` to client components. */
export function BrandProvider({ brand, children }: { brand: Brand; children: ReactNode }) {
  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>;
}

export const useBrand = (): Brand => useContext(BrandContext);
