import { Fragment, type ReactNode } from 'react';

/**
 * A translated sentence with elements inside it: "led by {wesolve}, developed
 * by {stride}" with `{ wesolve: <Link…/> }`. The whole sentence is one message,
 * so a translator can reorder it; splitting it into fragments around the links
 * would fix English word order into every language. An unknown slot is left
 * as written.
 */
export function rich(text: string, nodes: Record<string, ReactNode>): ReactNode {
  return text.split(/(\{\w+\})/).map((part, i) => {
    const slot = /^\{(\w+)\}$/.exec(part)?.[1];
    return <Fragment key={i}>{slot && slot in nodes ? nodes[slot] : part}</Fragment>;
  });
}
