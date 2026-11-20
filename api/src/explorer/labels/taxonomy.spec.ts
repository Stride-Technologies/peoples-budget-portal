import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { taxonomyFile, type TaxonomyFile } from './taxonomy.js';

const file = () =>
  JSON.parse(
    readFileSync(
      join(process.cwd(), 'prisma', 'data', 'explorer-labels.json'),
      'utf8',
    ),
  ) as TaxonomyFile;

describe('label taxonomy', () => {
  it('the shipped file is valid: two levels, every label mapped to a functional group and COFOG', () => {
    const rows = taxonomyFile(file());
    const top = rows.filter((r) => !r.parentId);
    expect(top.length).toBeGreaterThanOrEqual(15);
    for (const t of top) {
      expect(t.maps.functionalGroup).toBeTruthy();
      expect(t.maps.cofog).toMatch(/^\d\d$/);
      expect(t.aliases.en?.length).toBeGreaterThan(0);
    }
    expect(rows.filter((r) => r.parentId).length).toBeGreaterThan(30);
  });

  it('refuses a sub-label filed under the wrong parent, a duplicate, and the reserved id', () => {
    const bad = (mut: (f: TaxonomyFile) => void) => {
      const f = file();
      mut(f);
      return () => taxonomyFile(f);
    };
    expect(bad((f) => (f.labels[0].subs[0].id = 'education.x'))).toThrow(/not/);
    expect(bad((f) => f.labels.push({ ...f.labels[0] }))).toThrow(/twice/);
    expect(bad((f) => (f.labels[0].id = 'unclassified'))).toThrow();
  });
});
