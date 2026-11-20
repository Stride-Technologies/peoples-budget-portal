import type { ReactNode } from 'react';
import { EditorialPage } from '@/components/public/editorial/editorial-page';

export default function AipYearLayout({ children }: { children: ReactNode }) {
  return <EditorialPage>{children}</EditorialPage>;
}
