/**
 * The label taxonomy file (specs/018 redesign W24) → flat rows, checked.
 * Shared by the seed and the spec; the API reads the table, not the file.
 */
type Aliases = Partial<Record<'en' | 'fil' | 'bcl', string[]>>;

export interface TaxonomyFile {
  unclassified: { id: string; label: string; definition: string };
  labels: {
    id: string;
    label: string;
    definition: string;
    aliases?: Aliases;
    maps?: Record<string, string>;
    status?: 'draft' | 'approved';
    subs: {
      id: string;
      label: string;
      definition: string;
      aliases?: Aliases;
      status?: 'draft' | 'approved';
    }[];
  }[];
}

export interface TaxonomyRow {
  id: string;
  parentId: string | null;
  label: string;
  definition: string;
  aliases: Aliases;
  maps: Record<string, string>;
  status: 'draft' | 'approved';
  orderIndex: number;
}

/** The value a row with no label shows under (W25); never stored as a label. */
export const UNCLASSIFIED = 'unclassified';

const ID = /^[a-z0-9-]+$/;

export function taxonomyFile(f: TaxonomyFile): TaxonomyRow[] {
  const rows: TaxonomyRow[] = [];
  f.labels.forEach((l, i) => {
    rows.push({
      id: l.id,
      parentId: null,
      label: l.label,
      definition: l.definition,
      aliases: l.aliases ?? {},
      maps: l.maps ?? {},
      status: l.status ?? 'draft',
      orderIndex: i,
    });
    l.subs.forEach((s, j) =>
      rows.push({
        id: s.id,
        parentId: l.id,
        label: s.label,
        definition: s.definition,
        aliases: s.aliases ?? {},
        maps: {},
        status: s.status ?? 'draft',
        orderIndex: j,
      }),
    );
  });
  const seen = new Set<string>();
  for (const r of rows) {
    const [head, tail, extra] = r.id.split('.');
    const ok = r.parentId
      ? head === r.parentId && tail && ID.test(tail) && extra === undefined
      : ID.test(r.id);
    if (!ok)
      throw new Error(
        `Label id "${r.id}" is not "<label>" or "<label>.<sub>".`,
      );
    if (r.id === UNCLASSIFIED)
      throw new Error(`"${UNCLASSIFIED}" is reserved.`);
    if (seen.has(r.id)) throw new Error(`Label "${r.id}" appears twice.`);
    if (!r.label.trim() || r.definition.trim().length < 20)
      throw new Error(`Label "${r.id}" needs a name and a real definition.`);
    seen.add(r.id);
  }
  return rows;
}
