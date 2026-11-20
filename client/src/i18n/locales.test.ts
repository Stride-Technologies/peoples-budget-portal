import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isLiveLocale, localizedPath, splitLocale } from './locales.ts'
import { translate, translateSource } from './t.ts'

test('a /fil or /bcl prefix is the language; anything else is English', () => {
  assert.deepEqual(splitLocale('/bcl/learn/glossary'), { locale: 'bcl', path: '/learn/glossary' })
  assert.deepEqual(splitLocale('/fil'), { locale: 'fil', path: '/' })
  assert.deepEqual(splitLocale('/learn'), { locale: 'en', path: '/learn' })
  // `en` is never a prefix, and a path that merely starts with the letters is not one.
  assert.deepEqual(splitLocale('/en/learn'), { locale: 'en', path: '/en/learn' })
  assert.deepEqual(splitLocale('/filipino'), { locale: 'en', path: '/filipino' })
})

test('links keep the language, but never for the staff app or another site', () => {
  assert.equal(localizedPath('bcl', '/learn'), '/bcl/learn')
  assert.equal(localizedPath('bcl', '/'), '/bcl')
  assert.equal(localizedPath('fil', '/bcl/learn'), '/fil/learn')
  assert.equal(localizedPath('en', '/bcl/learn'), '/bcl/learn')
  assert.equal(localizedPath('bcl', '/aip-registry/2027'), '/aip-registry/2027')
  assert.equal(localizedPath('bcl', 'https://www.wesolve.ph/'), 'https://www.wesolve.ph/')
  assert.equal(localizedPath('bcl', '#main-content'), '#main-content')
})

test('a language is public only once reviewed; dev and staging always offer it', () => {
  assert.equal(isLiveLocale('en', 'production'), true)
  assert.equal(isLiveLocale('bcl', 'staging'), true)
  // review.json ships with both languages unsigned.
  assert.equal(isLiveLocale('bcl', 'production'), false)
  assert.equal(isLiveLocale('fil', 'production'), false)
})

test('a stale or missing translation reads in English, with its slots filled', () => {
  // `src` is the English a translation was made from: once the English changes, the old text is not shown.
  assert.equal(translateSource('bcl', 'nav.learn', 'Learn more {n}', { n: 2 }), 'Learn more 2')
  assert.equal(translateSource('fil', 'no.such.key', 'Hello {name}', { name: 'Naga' }), 'Hello Naga')
  assert.equal(translate('en', 'footer.copyright', { year: 2026 }).startsWith('© 2026 '), true)
})

test('a prefixed staff URL is still the staff app once the prefix is stripped', async () => {
  const { isProtectedRoute } = await import('../lib/protected-routes.ts')
  assert.equal(isProtectedRoute(splitLocale('/fil/aip-registry').path), true)
  assert.equal(isProtectedRoute(splitLocale('/bcl/learn').path), false)
})
