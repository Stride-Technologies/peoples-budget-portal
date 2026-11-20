import type { ReactNode } from 'react';
import { EditorialPage } from '@/components/public/editorial/editorial-page';

export default function PpmpYearLayout({ children }: { children: ReactNode }) {
  return <EditorialPage>{children}</EditorialPage>;
}
