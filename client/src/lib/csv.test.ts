import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { csvCell } from './csv.ts';

test('csvCell keeps formula-looking text as text', () => {
  assert.equal(csvCell('=HYPERLINK("http://x","y")'), `"'=HYPERLINK(""http://x"",""y"")"`);
  for (const lead of ['+', '-', '@', '\t', '\r']) {
    assert.ok(csvCell(`${lead}cmd`).replace(/^"/, '').startsWith(`'${lead}`), JSON.stringify(lead));
  }
});

test('csvCell leaves numbers and ordinary text alone', () => {
  assert.equal(csvCell('-1250.00'), '-1250.00');
  assert.equal(csvCell('+63'), '+63');
  assert.equal(csvCell('Maayong aldaw'), 'Maayong aldaw');
  assert.equal(csvCell('a, b'), '"a, b"');
});
