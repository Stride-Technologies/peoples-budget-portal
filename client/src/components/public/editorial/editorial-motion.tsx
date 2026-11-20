'use client';

import { useEffect } from 'react';
import { animate, onScroll, stagger, splitText } from 'animejs';

/**
 * The AnimeJS enhancement layer over the CSS motion floor.
 *
 * Mounted **once** per editorial page. The sections themselves stay server
 * components — one client island costs less than thirty.
 *
 * ## What this does and does not animate
 *
 * **It does not touch the reveals or the bars.** Those are CSS, scroll-linked
 * through `animation-timeline: view()`, and they are already drawn at first
 * paint. This component used to drive them too: it waited ~530ms for hydration,
 * switched the CSS off, reset every bar to `scaleX(0)` and redrew them over up to
 * 1.3s — so the page appeared to spend nearly two seconds loading charts that had
 * already been on screen. Two animations on one element is the same bug that
 * shipped a finish-line card invisible; this was it one layer up, between the CSS
 * layer and this one.
 *
 * What is left is only what CSS cannot do: splitting a sentence into words,
 * staggering a set of sibling cards, and the drawer. None of those elements carry
 * a CSS animation, so nothing here contends with anything — and each is visible
 * without JavaScript rather than hidden waiting for it.
 *
 * Every property animated here is one React does not set inline.
 *
 * ## Why AnimeJS and not Lenis
 *
 * The reference site uses both. `onScroll` *observes* scroll to trigger and link
 * animations; Lenis *replaces* native scrolling with a transform. That would
 * break the CSS scroll-snap and the nested figure panes this page depends on, so
 * only the observer half is here.
 */
/**
 * Slides the outline drawer in and staggers its rows.
 *
 * Called by `SectionOutline` on open rather than wired to scroll, and it checks
 * the motion preference itself because it runs outside this component's effect.
 */
export function animateOutlineOpen(panel: HTMLElement) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  animate(panel, {
    x: ['-100%', '0%'],
    duration: 420,
    ease: 'out(4)',
  });
  const rows = panel.querySelectorAll<HTMLElement>('[data-outline-row]');
  if (rows.length > 0) {
    animate(rows, {
      opacity: [0, 1],
      x: [-14, 0],
      duration: 460,
      ease: 'out(3)',
      delay: stagger(38, { start: 90 }),
    });
  }
}

export function EditorialMotion() {
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    // Cleanup has to undo the split as well as the animations, or a re-mount
    // splits already-split words into single characters.
    const cleanups: (() => void)[] = [];

    // ── Section text ────────────────────────────────────────────────────────
    // The claim arrives a word at a time. This needs JavaScript by nature —
    // there is no CSS way to split a sentence into per-word elements.
    document.querySelectorAll<HTMLElement>('[data-claim]').forEach((el) => {
      const split = splitText(el, { words: true, chars: false });
      animate(split.words, {
        opacity: [0, 1],
        y: [{ from: '0.5em', to: '0em' }],
        duration: 620,
        ease: 'out(3)',
        delay: stagger(22),
        autoplay: onScroll({ target: el, enter: 'bottom-=10% top', repeat: false }),
      });
      cleanups.push(() => split.revert());
    });

    // ── Card and figure grids ───────────────────────────────────────────────
    // Groups that used to reveal as one block now arrive item by item. A grid of
    // eight cards appearing simultaneously reads as a page-load; staggered, it
    // reads as composition.
    document
      .querySelectorAll<HTMLElement>('[data-stagger]')
      .forEach((group) => {
        const items = group.querySelectorAll<HTMLElement>(':scope > *');
        if (items.length < 2) return;
        animate(items, {
          opacity: [0, 1],
          y: [14, 0],
          duration: 520,
          ease: 'out(3)',
          // Budgeted, not fixed. A fixed per-item delay makes an eight-card grid
          // take four times as long as a two-card one for no reason; capping the
          // whole spread keeps every group settling in about the same time.
          delay: stagger(Math.min(60, 240 / items.length)),
          autoplay: onScroll({
            target: group,
            enter: 'bottom-=6% top',
            repeat: false,
          }),
        });
      });

    // The rule under a section's step number draws itself.
    document.querySelectorAll<HTMLElement>('[data-rule]').forEach((rule) => {
      animate(rule, {
        scaleX: [0, 1],
        duration: 520,
        ease: 'out(4)',
        autoplay: onScroll({ target: rule, enter: 'bottom-=5% top', repeat: false }),
      });
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
