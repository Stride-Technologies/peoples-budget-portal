import { CacheService } from '../cache/cache.service.js';
import { MemoryCacheStore } from '../cache/memory-cache.store.js';
import type { Catalogue, CatalogueService } from './catalogue.service.js';
import type { EmbedPort } from './ports/embed.port.js';
import { ResolveService } from './resolve.service.js';
import { CAT } from './test-catalogue.js';

// "health" is both a topic and (here) a cluster, as on the real catalogue.
const cat: Catalogue = {
  ...CAT,
  version: 'resolve-test',
  dimensions: {
    ...CAT.dimensions,
    cluster: [{ id: 'health', label: 'Health', dbIds: [], aliases: {} }],
    topic: [
      {
        id: 'health',
        label: 'Health',
        dbIds: [],
        aliases: { fil: ['kalusugan'] },
      },
      { id: 'planning', label: 'Planning', dbIds: [], aliases: {} },
    ],
  },
};

/** Vectors on two axes: anything mentioning "plan" points one way, the rest the other. */
const embedder: EmbedPort = {
  model: 'fake',
  embed: (texts) =>
    Promise.resolve(
      texts.map((t) => (/plan/i.test(t) ? [0.9, 0.1] : [0.1, 0.9])),
    ),
};

const make = (e: EmbedPort | null) =>
  new ResolveService(
    { get: () => Promise.resolve(cat) } as unknown as CatalogueService,
    new CacheService(new MemoryCacheStore()),
    e,
  );

describe('ResolveService', () => {
  beforeEach(() => {
    process.env.EXPLORER_ENABLED = '1';
    process.env.EXPLORER_AI_ENABLED = '1';
  });

  it('names the topic, not the same-named cluster, and matches any language', async () => {
    const r = await make(null).resolve('magkano ang para sa kalusugan?');
    expect(r).toEqual([
      { dim: 'topic', id: 'health', label: 'Health', score: 1, via: 'alias' },
    ]);
    expect((await make(null).resolve('health in 2027'))[0]).toMatchObject({
      dim: 'topic',
      id: 'health',
    });
  });

  it('ignores a word that is only a dimension name, and keeps ids with spaces whole', async () => {
    const withSpace: Catalogue = {
      ...cat,
      version: 'resolve-test-2',
      dimensions: {
        ...cat.dimensions,
        office: [
          {
            id: 'CHO II',
            label: 'City Health Office II',
            dbIds: [],
            aliases: {},
          },
        ],
      },
    };
    const svc = new ResolveService(
      { get: () => Promise.resolve(withSpace) } as unknown as CatalogueService,
      new CacheService(new MemoryCacheStore()),
      null,
    );
    expect(
      (
        await svc.resolve('what does the city health office ii office spend')
      ).map((c) => `${c.dim}:${c.id}`),
    ).toEqual(['office:CHO II']);
  });

  it('fills in by meaning when nothing is named, and is the same twice', async () => {
    const svc = make(embedder);
    const first = await svc.resolve('our zoning plans');
    expect(first[0]).toMatchObject({
      dim: 'topic',
      id: 'planning',
      via: 'vector',
    });
    expect(await svc.resolve('our zoning plans')).toEqual(first);
  });

  it('works without an embedding model, and with AI off', async () => {
    process.env.EXPLORER_AI_ENABLED = '0';
    expect(await make(embedder).resolve('our zoning plans')).toEqual([]);
  });
});
