import { MemoryCacheStore } from './memory-cache.store.js';

describe('MemoryCacheStore', () => {
  it('stays under its size bound, evicting the least recently used first', async () => {
    const store = new MemoryCacheStore(10);
    await store.set('a', '1234', 60);
    await store.set('b', '1234', 60);
    await store.get('a'); // a is now more recent than b
    await store.set('c', '1234', 60); // 12 chars > 10: evict b

    expect(await store.get('b')).toBeNull();
    expect(await store.get('a')).toBe('1234');
    expect(await store.get('c')).toBe('1234');
  });

  it('never stores a value larger than the whole bound', async () => {
    const store = new MemoryCacheStore(3);
    await store.set('big', '1234', 60);
    expect(await store.get('big')).toBeNull();
  });

  it('frees the size of an overwritten key', async () => {
    const store = new MemoryCacheStore(8);
    for (let i = 0; i < 100; i++) await store.set('k', '1234', 60);
    await store.set('other', '1234', 60);
    expect(await store.get('k')).toBe('1234');
    expect(await store.get('other')).toBe('1234');
  });
});
