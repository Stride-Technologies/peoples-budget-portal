'use client';

/**
 * The desktop workspace, only on desktop (specs/018 redesign W19): below
 * 1024 px today's `/explore` page shows instead, and the workspace's code —
 * Vega included — is never downloaded. Client-only: the workbook lives in
 * this browser's storage, so there is nothing to render on the server.
 */
import dynamic from 'next/dynamic';
import { useSyncExternalStore, type ComponentProps } from 'react';

const Workspace = dynamic(() => import('./workspace').then((m) => m.Workspace), { ssr: false });

const WIDE = '(min-width: 1024px)';
const subscribe = (f: () => void) => {
  const m = matchMedia(WIDE);
  m.addEventListener('change', f);
  return () => m.removeEventListener('change', f);
};

export function WorkspaceGate(props: ComponentProps<typeof Workspace>) {
  const wide = useSyncExternalStore(subscribe, () => matchMedia(WIDE).matches, () => false);
  return wide ? <Workspace {...props} /> : null;
}
