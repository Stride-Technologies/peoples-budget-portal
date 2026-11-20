import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import en from './messages/en.json' with { type: 'json' }
import fil from './messages/fil.json' with { type: 'json' }
import bcl from './messages/bcl.json' with { type: 'json' }
import { codeSource, glossaryTerms } from './code-copy.ts'

/**
 * The translation catalogues (specs/014 FR-003, FR-008, SC-002). Run with
 * `pnpm --filter client test`. Fails on a translation that drops or alters a
 * budget term, a number, a date or a peso amount, or keeps a masking token.
 */
// Keys whose English is in en.json, or in code (`code-copy.ts`).
const ENGLISH = { ...(en as Record<string, string>), ...codeSource() }
const CATALOGUES = { fil, bcl } as Record<string, Record<string, { text: string; src: string }>>

// Budget vocabulary that stays in English in every language: the hand list
// (tools/translate/protected-terms.txt) plus the glossary's terms. Matched as
// translate.py masks them: acronyms as written, phrases in any case and plural.
const PROTECTED = [
  ...readFileSync(new URL('../../../tools/translate/protected-terms.txt', import.meta.url), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
  ...glossaryTerms(),
]
const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const termPattern = (t: string) =>
  t === t.toUpperCase() ? new RegExp(`(?<![\\w])${escape(t)}(?![\\w])`, 'g') : new RegExp(`(?<![\\w])${escape(t)}s?(?![\\w])`, 'gi')

// The words that follow LGU_TYPE (lib/brand.ts messageVars). A translation may say "ng {lgu}"
// where English says "{lguAdj} offices", so their count is not compared.
const LGU_WORD = /^\{(lgu|Lgu|lguAdj|LguAdj|council)\}$/
/** Every number, peso amount and `{slot}` in a string; a sentence's full stop is not part of its number. */
const invariants = (s: string) => (s.match(/₱?\d(?:[\d,.]*\d)?|\{\w+\}/g) ?? []).filter((m) => !LGU_WORD.test(m))

for (const [lang, catalogue] of Object.entries(CATALOGUES)) {
  test(`${lang}: every key exists in English`, () => {
    for (const key of Object.keys(catalogue)) {
      assert.ok(key in ENGLISH, `${lang} has "${key}", which en.json does not`)
    }
  })

  test(`${lang}: protected terms, numbers and slots survive translation`, () => {
    for (const [key, { text, src }] of Object.entries(catalogue)) {
      assert.doesNotMatch(text, /⟦\d+⟧/, `${lang} "${key}" still holds a masking token`)
      assert.deepEqual(invariants(text).sort(), invariants(src).sort(), `${lang} "${key}" changed a number or slot`)
      for (const term of PROTECTED) {
        for (const [found] of src.matchAll(termPattern(term))) {
          assert.ok(text.includes(found), `${lang} "${key}" dropped the protected term "${found}"`)
        }
      }
    }
  })
}

// Copy is read by cities, municipalities and provinces alike: the LGU's kind, its council and its
// chief executive come from slots. These keys name the kinds on purpose.
const NAMES_KINDS = new Set(['code.level.meaning', 'cycle.stage.7.who.0.role', 'cycle.stage.7.know'])
test('no copy says "city", "Mayor" or "Panlungsod" outright', () => {
  for (const [key, text] of Object.entries(ENGLISH)) {
    if (NAMES_KINDS.has(key)) continue
    assert.doesNotMatch(text, /\bcit(y|ies)\b|(?<!\{)\bMayor\b|Panlungsod/i, `"${key}" should use {lgu}, {lguAdj}, {Mayor} or {council}`)
  }
  for (const [lang, catalogue] of Object.entries(CATALOGUES)) {
    for (const [key, { text, src }] of Object.entries(catalogue)) {
      if (src !== ENGLISH[key] || NAMES_KINDS.has(key)) continue
      assert.doesNotMatch(text, /\bcity\b|lungsod|siyudad|syudad|ciudad|(?<!\{)\bMayor\b|Alkalde/i, `${lang} "${key}" names a kind of LGU outright`)
    }
  }
})

test('the protected list is not empty', () => {
  assert.ok(PROTECTED.length > 10)
})
