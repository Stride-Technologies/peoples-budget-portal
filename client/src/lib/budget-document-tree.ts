/**
 * A budget document's PPAs (specs/012) in reading order: grouped by office,
 * roots by PAP class (GAS → STO → Operations, none last) then position, each
 * root followed by its tree depth-first. The same order as the public registry.
 */
export interface TreeItem {
  id: string;
  parentId: string | null;
  orderIndex: number;
  papClass: string | null;
  total: string;
  office: { id: string; acronym: string; name: string };
}

const PAP_RANK: Record<string, number> = { GAS: 0, STO: 1, OPERATIONS: 2 };
const rank = (c: string | null) => (c === null ? 3 : (PAP_RANK[c] ?? 3));

export interface OfficeGroup<T extends TreeItem> {
  office: T['office'];
  rows: Array<{ item: T; depth: number }>;
  /** The office's top-level PPAs, whose totals already hold their trees. */
  roots: T[];
}

export function officeGroups<T extends TreeItem>(items: T[]): OfficeGroup<T>[] {
  const ids = new Set(items.map((i) => i.id));
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const i of items) {
    // A child whose parent is out of the caller's scope reads as a root.
    if (i.parentId && ids.has(i.parentId)) {
      children.set(i.parentId, [...(children.get(i.parentId) ?? []), i]);
    } else roots.push(i);
  }
  for (const list of children.values()) list.sort((a, b) => a.orderIndex - b.orderIndex);
  roots.sort(
    (a, b) =>
      a.office.acronym.localeCompare(b.office.acronym) ||
      rank(a.papClass) - rank(b.papClass) ||
      a.orderIndex - b.orderIndex,
  );

  const groups = new Map<string, OfficeGroup<T>>();
  const walk = (group: OfficeGroup<T>, item: T, depth: number) => {
    group.rows.push({ item, depth });
    for (const c of children.get(item.id) ?? []) walk(group, c, depth + 1);
  };
  for (const r of roots) {
    let g = groups.get(r.office.id);
    if (!g) groups.set(r.office.id, (g = { office: r.office, rows: [], roots: [] }));
    g.roots.push(r);
    walk(g, r, 0);
  }
  return [...groups.values()];
}
