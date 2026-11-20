import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import {
  DEFAULT_REGISTRY_FILTERS,
  deepLinkRegistryFilters,
  parseRegistryFilters,
  writeRegistryFilters,
} from './filter-cookie.ts'

/**
 * Run with `pnpm --filter client test`.
 *
 * The cookie is user-writable, survives deploys, and names ids that may be gone,
 * so `parseRegistryFilters` is a trust boundary: whatever it returns goes straight
 * into a registry query. Every field falls back on its own.
 */

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

test('reads a full set of saved filters', () => {
  const raw = JSON.stringify({
    tab: 'DRAFTS',
    cycleId: 'cycle-1',
    clusterId: 'cluster-1',
    officeId: 'office-1',
    finishLineIds: ['fl-1', 'fl-2'],
    thematicTagIds: ['tag-1'],
    search: 'roads',
    showBreakdown: false,
    pageSize: 50,
  })

  assert.deepEqual(parseRegistryFilters(raw), {
    tab: 'DRAFTS',
    cycleId: 'cycle-1',
    clusterId: 'cluster-1',
    officeId: 'office-1',
    finishLineIds: ['fl-1', 'fl-2'],
    thematicTagIds: ['tag-1'],
    search: 'roads',
    showBreakdown: false,
    pageSize: 50,
  })
})

test('missing cookie yields the defaults', () => {
  assert.deepEqual(parseRegistryFilters(undefined), DEFAULT_REGISTRY_FILTERS)
  assert.deepEqual(parseRegistryFilters(null), DEFAULT_REGISTRY_FILTERS)
  assert.deepEqual(parseRegistryFilters(''), DEFAULT_REGISTRY_FILTERS)
})

test('junk never reaches a query', () => {
  for (const raw of ['not-json', '{broken', '"a-bare-string"', '42', '[1,2]', 'null']) {
    assert.deepEqual(parseRegistryFilters(raw), DEFAULT_REGISTRY_FILTERS, raw)
  }
})

test('each unrecognized field falls back on its own', () => {
  const parsed = parseRegistryFilters(
    JSON.stringify({
      tab: 'NOPE', // not a RegistryTab
      cycleId: 42, // wrong type
      clusterId: null,
      finishLineIds: ['keep-me', 7, null], // mixed array
      thematicTagIds: ['keep-tag', 7, null], // mixed array
      search: { not: 'a string' },
      showBreakdown: 'yes', // string, not boolean
      pageSize: 999, // not an offered page size
    }),
  )

  assert.equal(parsed.tab, 'ALL')
  assert.equal(parsed.cycleId, '')
  assert.equal(parsed.clusterId, 'all')
  assert.equal(parsed.officeId, 'all')
  assert.deepEqual(parsed.finishLineIds, ['keep-me'])
  assert.deepEqual(parsed.thematicTagIds, ['keep-tag'])
  assert.equal(parsed.search, '')
  assert.equal(parsed.showBreakdown, true)
  assert.equal(parsed.pageSize, 10)
})

test('a valid tab and page size survive', () => {
  for (const tab of ['ALL', 'DRAFTS', 'REVISIONS', 'PUBLISHED'] as const) {
    assert.equal(parseRegistryFilters(JSON.stringify({ tab })).tab, tab)
  }
  for (const pageSize of [10, 20, 50] as const) {
    assert.equal(parseRegistryFilters(JSON.stringify({ pageSize })).pageSize, pageSize)
  }
})

test('writes a round-trippable cookie with sane attributes', () => {
  const doc = { cookie: '' }
  ;(globalThis as { document?: typeof doc }).document = doc

  const filters = { ...DEFAULT_REGISTRY_FILTERS, tab: 'PUBLISHED' as const, search: 'a b&c=d' }
  writeRegistryFilters(filters)

  assert.match(doc.cookie, /^pbp\.aip-registry\.filters=/)
  assert.match(doc.cookie, /path=\//)
  assert.match(doc.cookie, /SameSite=Lax/)
  // Values with `&` and `=` must not break the cookie apart.
  const value = doc.cookie.split(';')[0].split('=').slice(1).join('=')
  assert.deepEqual(parseRegistryFilters(decodeURIComponent(value)), filters)
})

test('writing is inert during server rendering', () => {
  delete (globalThis as { document?: unknown }).document
  // Must not throw: the module is imported by a component that prerenders.
  writeRegistryFilters(DEFAULT_REGISTRY_FILTERS)
})

test('a deep link drops every narrowing filter but keeps the cycle and display prefs', () => {
  const saved = {
    tab: 'DRAFTS' as const,
    cycleId: 'cycle-1',
    clusterId: 'cluster-1',
    officeId: 'office-1',
    finishLineIds: ['fl-1'],
    thematicTagIds: ['tag-1'],
    search: 'roads',
    showBreakdown: false,
    pageSize: 50 as const,
  }
  assert.deepEqual(deepLinkRegistryFilters(saved), {
    ...DEFAULT_REGISTRY_FILTERS,
    cycleId: 'cycle-1',
    showBreakdown: false,
    pageSize: 50,
  })
})
