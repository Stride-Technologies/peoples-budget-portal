import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseRegistryPath, registryPath } from './registry-paths.ts'

test('builds and parses every registry shape', () => {
  const cases = [
    [null, '/aip-registry/2027'],
    [{ programId: 'p1' }, '/aip-registry/2027/program/p1'],
    [{ programId: 'p1', edit: true }, '/aip-registry/2027/program/p1/edit'],
    [{ programId: 'p1', paId: 'a1' }, '/aip-registry/2027/program/p1/a1'],
    [{ programId: 'p1', paId: 'a1', edit: true }, '/aip-registry/2027/program/p1/a1/edit'],
  ] as const
  for (const [target, path] of cases) {
    assert.equal(registryPath(2027, target), path)
    assert.deepEqual(parseRegistryPath(path), { year: 2027, target })
  }
})

test('rejects malformed paths', () => {
  for (const path of [
    '/aip-registry',
    '/aip-registry/27',
    '/aip-registry/2027/project/p1',
    '/aip-registry/2027/program',
    '/aip-registry/2027/program/edit',
    '/aip-registry/2027/program/p1/a1/b1',
    '/programs/2027',
  ]) {
    assert.equal(parseRegistryPath(path), null, path)
  }
})
