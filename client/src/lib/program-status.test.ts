import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  isDeletableProgramStatus,
  isEditableProgramStatus,
  isPublishedProgramStatus,
  toProgramStatusKey,
} from './program-status.ts'

/**
 * Run with `pnpm --filter client test`.
 *
 * These pin the client's copy of the API's status sets
 * (`api/src/programs/program-status.constants.ts`). Drift here shows up as a
 * control greyed out for an action the server accepts — which is exactly what
 * happened to Delete on a PPA inside an open revision.
 */

test('editable statuses match the API set', () => {
  for (const status of ['DRAFT', 'FOR_REVISION', 'PUBLISHED_REVISION']) {
    assert.equal(isEditableProgramStatus(status), true, status)
  }
  for (const status of [
    'SUBMITTED',
    'HEAD_REVIEWED',
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'PUBLISHED',
    'ARCHIVED',
  ]) {
    assert.equal(isEditableProgramStatus(status), false, status)
  }
})

test('an archived program is read-only and not published (specs/013)', () => {
  assert.equal(toProgramStatusKey('ARCHIVED'), 'ARCHIVED')
  assert.equal(toProgramStatusKey('Archived'), 'ARCHIVED')
  assert.equal(isDeletableProgramStatus('ARCHIVED'), false)
  assert.equal(isPublishedProgramStatus('ARCHIVED'), false)
})

test('a published program is never deletable, in either state', () => {
  assert.equal(isDeletableProgramStatus('DRAFT'), true)
  assert.equal(isDeletableProgramStatus('FOR_REVISION'), true)
  assert.equal(isDeletableProgramStatus('PUBLISHED'), false)
  assert.equal(isDeletableProgramStatus('PUBLISHED_REVISION'), false)
})

/**
 * The PPA-level rule. `ProjectActivitiesService` guards create/update/reorder/
 * delete with `isEditableStatus`, so removing a PPA from an open revision is
 * allowed — the public keeps seeing the published snapshot until a republish.
 * Gating PPA delete on `isDeletableProgramStatus` disabled the button on every
 * PPA in a revision.
 */
test('PPA-level actions follow the editable set, not the deletable one', () => {
  assert.equal(isEditableProgramStatus('PUBLISHED_REVISION'), true)
  assert.notEqual(
    isEditableProgramStatus('PUBLISHED_REVISION'),
    isDeletableProgramStatus('PUBLISHED_REVISION'),
  )
})

test('labels, raw keys, and legacy spellings all resolve', () => {
  assert.equal(toProgramStatusKey('Revision'), 'PUBLISHED_REVISION')
  assert.equal(toProgramStatusKey('Draft changes'), 'PUBLISHED_REVISION')
  assert.equal(toProgramStatusKey('for revision'), 'FOR_REVISION')
  assert.equal(toProgramStatusKey('PUBLISHED_REVISION'), 'PUBLISHED_REVISION')
  assert.equal(isEditableProgramStatus('Revision'), true)
  assert.equal(isPublishedProgramStatus('Published'), true)
  // Unknown input must not fall back to DRAFT and hand out rights.
  assert.equal(toProgramStatusKey('WAT'), null)
  assert.equal(isEditableProgramStatus('WAT'), false)
  assert.equal(isEditableProgramStatus(null), false)
})
