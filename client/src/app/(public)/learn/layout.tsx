import type { ReactNode } from 'react';
import { LearnPager } from '@/components/public/learn/learn-nav';

// The tabs live in each page's header (LearnHero); the pager closes every page.
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <div className="bg-paper font-sans text-ink">
        <LearnPager />
      </div>
    </>
  );
}
