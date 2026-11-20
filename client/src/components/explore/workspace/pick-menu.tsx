'use client';

/**
 * What a click on a mark (or a table row's name) offers (W21): keep only,
 * exclude, drill down, show the records. Fixed at the click; Escape, a click
 * elsewhere or a choice closes it, and focus goes back where it was.
 */
import { useEffect, useRef } from 'react';
import { useT } from '@/i18n/locale-provider';
import type { Picked } from '@/lib/explore/sheets';
import type { At } from './parts';

export type PickAction = 'keep' | 'exclude' | 'drill' | 'records';

export function PickMenu({ pick, at, drillTo, onAct, onClose }: { pick: Picked; at: At; drillTo: string | null; onAct: (a: PickAction) => void; onClose: () => void }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  // Read through a ref: a parent re-render must not re-run the focus effect below.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const onClose = () => close.current();
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector('button')?.focus();
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const items = [...(box.current?.querySelectorAll('button') ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    };
    document.addEventListener('pointerdown', away, true);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('keydown', key);
      back?.focus?.();
    };
  }, []);
  const item = (a: PickAction, label: string) => (
    <button type="button" role="menuitem" onClick={() => onAct(a)}>
      {label}
    </button>
  );
  // Kept inside the window: a click near the right or bottom edge opens up and to the left.
  const style = { left: Math.min(at.x, innerWidth - 260), top: Math.min(at.y + 4, innerHeight - 190) };
  return (
    <div ref={box} className="pickmenu" role="menu" aria-label={pick.label} style={style} data-testid="pick-menu">
      <p className="pick-h">{pick.label}</p>
      {item('keep', t('explore.ws.pick.keep'))}
      {item('exclude', t('explore.ws.pick.exclude'))}
      {drillTo && item('drill', t('explore.ws.pick.drill', { field: drillTo }))}
      {item('records', t('explore.ws.pick.records'))}
    </div>
  );
}
