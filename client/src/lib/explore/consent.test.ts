import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { consentField } from './consent.ts';

test('trainingConsent is sent only when the box is shown and ticked', () => {
  assert.deepEqual(consentField(true, true), { trainingConsent: true });
  assert.deepEqual(consentField(true, false), {});
  // A stale tick where the LGU switched capture off must not travel.
  assert.deepEqual(consentField(false, true), {});
  assert.deepEqual(consentField(false, false), {});
});
