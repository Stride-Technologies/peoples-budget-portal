import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AIP_READING_GUIDE_COPY, fillGuideText } from './aip-reading-guide-copy.ts'

const figures = {
  proposed: '₱9.06 billion',
  priorYear: 2026,
  priorTotal: '₱2.12 billion',
  lastUpdated: 'October 27, 2026',
}

test('fills every slot from live figures', () => {
  assert.equal(
    fillGuideText('This draft asks for about {proposed}. The whole {priorYear} budget was about {priorTotal}.', figures),
    'This draft asks for about ₱9.06 billion. The whole 2026 budget was about ₱2.12 billion.',
  )
})

test('drops only the sentence whose figure is missing', () => {
  assert.equal(
    fillGuideText('This draft asks for about {proposed}. The whole {priorYear} budget was about {priorTotal}.', { ...figures, priorTotal: null }),
    'This draft asks for about ₱9.06 billion.',
  )
  assert.equal(fillGuideText('Updated on {lastUpdated}.', { ...figures, lastUpdated: null }), null)
})

test('no fiscal year writes a figure as text in its copy (FR-005)', () => {
  assert.doesNotMatch(JSON.stringify(AIP_READING_GUIDE_COPY), /₱\s?\d/)
})
