import type { ReactNode } from 'react';
import { EditorialMotion } from './editorial-motion';

/**
 * The paper surface every editorial page sits on.
 *
 * Motion comes in two layers: pure CSS in `globals.css` (which works with no
 * JavaScript at all) and the AnimeJS enhancement in `EditorialMotion`, which
 * switches the CSS layer off when it takes over so the two never animate the
 * same property. See that component for why Lenis is not here.
 */
export function EditorialPage({ children }: { children: ReactNode }) {
  return (
    <div className="bg-paper font-sans text-ink">
      <EditorialMotion />
      {children}
    </div>
  );
}
