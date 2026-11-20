import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compactPeso,
  formatMillions,
  formatPesoWhole,
  formatWholePesos,
  spokenPeso,
  subtractDecimalStrings,
} from './currency-formatter.ts';

test('subtractDecimalStrings works in centavos, never floats', () => {
  // The float trap this exists to dodge: 0.3 - 0.1 === 0.19999999999999998.
  assert.equal(subtractDecimalStrings('0.30', '0.10'), '0.20');
  assert.equal(subtractDecimalStrings('151266000.00', '3400000.00'), '147866000.00');
  assert.equal(subtractDecimalStrings('1000000.00', '1000000.00'), '0.00');
});

test('subtractDecimalStrings clamps a negative remainder to zero', () => {
  // A remainder below zero means the parts exceed the total — a data problem.
  // Rendering "-₱4.00" in a budget-mix bar would be worse than showing nothing.
  assert.equal(subtractDecimalStrings('100.00', '250.25'), '0.00');
});

test('subtractDecimalStrings treats unparseable input as zero', () => {
  assert.equal(subtractDecimalStrings('100.00', 'abc'), '100.00');
  assert.equal(subtractDecimalStrings('', '5.00'), '0.00');
});

test('formatPesoWhole groups digits and drops the centavos', () => {
  assert.equal(formatPesoWhole('151266000.00'), '₱ 151,266,000');
  assert.equal(formatPesoWhole('999.99'), '₱ 999');
  assert.equal(formatPesoWhole('0.00'), '₱ 0');
});

// ─── Editorial display figures ───────────────────────────────────────────────

test('compactPeso keeps the digit that distinguishes two nearby billions', () => {
  // Intl compact notation renders both of these "₱1.7B"; the difference is ₱50M.
  assert.equal(compactPeso('1664699680.00'), '₱1.66B');
  assert.equal(compactPeso('1714699680.00'), '₱1.71B');
});

test('compactPeso picks a scale word per magnitude', () => {
  assert.equal(compactPeso('147866000.00'), '₱147.87M');
  assert.equal(compactPeso('790000.00'), '₱790.00K');
  assert.equal(compactPeso('4614210000.00'), '₱4.61B');
  assert.equal(compactPeso('0'), '₱0');
  assert.equal(compactPeso('-250000.00'), '-₱250.00K');
});

test('compactPeso stays at two decimals across the whole bucket', () => {
  // The longest string this can produce: three integer digits plus two decimals.
  assert.equal(compactPeso('147866000000.00'), '₱147.87B');
  assert.equal(compactPeso('999990000000.00'), '₱999.99B');
});

test('spokenPeso says the number a screen reader can hold', () => {
  assert.equal(spokenPeso('147866000.00'), '147.87 million pesos');
  assert.equal(spokenPeso('1664699680.00'), '1.66 billion pesos');
  assert.equal(spokenPeso('0'), '0 pesos');
  assert.equal(spokenPeso('-250000.00'), 'negative 250 thousand pesos');
});

test('spokenPeso trims trailing zeros rather than saying "point zero"', () => {
  assert.equal(spokenPeso('2000000.00'), '2 million pesos');
  assert.equal(spokenPeso('2500000.00'), '2.5 million pesos');
});

test('formatWholePesos separates without inventing centavos', () => {
  assert.equal(formatWholePesos('1664699680.00'), '1,664,699,680');
});

test('formatMillions labels the scale it is already using', () => {
  assert.equal(formatMillions(16_319_000), '16.319M');
  assert.equal(formatMillions(2_338_429_000), '2,338.429M');
  assert.equal(
    formatMillions(6_067_751_000, { includeCurrency: true }),
    'PHP 6,067.751M',
  );
});

test('formatMillions only reaches billions when asked, and at ₱1,000M', () => {
  const opts = { includeCurrency: true, autoScale: true };
  // The office column stays comparable because autoScale is opt-in.
  assert.equal(formatMillions(999_400_000, opts), 'PHP 999.400M');
  assert.equal(formatMillions(1_000_000_000, opts), 'PHP 1.000B');
  // Rounds up to 1,000.000M at three places, so it belongs in billions.
  assert.equal(formatMillions(999_999_999, opts), 'PHP 1.000B');
  assert.equal(formatMillions(6_067_751_000, opts), 'PHP 6.068B');
  // Same figure, no autoScale: still the millions column.
  assert.equal(formatMillions(6_067_751_000), '6,067.751M');
});

test('formatMillions keeps its guards', () => {
  assert.equal(formatMillions(0), ' - ');
  assert.equal(formatMillions(undefined), ' - ');
  // Under a thousandth of a million — rounding would print a bare 0.000.
  assert.equal(formatMillions(500), '< 0.001M');
});
