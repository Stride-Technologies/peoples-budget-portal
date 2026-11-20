/**
 * Format a Philippine Peso currency value (₱).
 * Accepts a string (Decimal serialized from the API) or a number.
 */
export function formatCurrency(value: string | number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(typeof value === 'string' ? parseFloat(value) || 0 : value)
}

/**
 * Format a Philippine Peso value without currency symbol.
 * Accepts a string (Decimal serialized from the API) or a number.
 */
export function formatAmount(value: string | number): string {
  return new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(typeof value === 'string' ? parseFloat(value) || 0 : value)
}

/**
 * Sum decimal strings **exactly**, returning a decimal string.
 *
 * Money is `Decimal(18, 2)` on the wire and must never round-trip through a
 * float: `0.1 + 0.2` is the canonical reason, and at peso scale that drift shows
 * up in totals. The dodge is to work in whole **centavos** — the scale is fixed
 * at two places, so integer arithmetic is exact and no decimal library is needed
 * for a sum this small.
 *
 * Integers are safe here where fractions are not: `Number.MAX_SAFE_INTEGER` is
 * ~9e15 centavos, i.e. ₱90 trillion, several orders of magnitude above any city
 * budget. A `Decimal(18,2)` value could in principle exceed that, so this helper
 * is for summing form fields — not for reproducing server-side rollups.
 *
 * Empty or non-numeric entries count as zero, which is what an untouched form
 * field means.
 */
export function addDecimalStrings(
  values: (string | null | undefined)[],
): string {
  const centavos = values.reduce((total, value) => {
    if (!value) return total;
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return total;
    return (
      total +
      Number(match[1]) * 100 +
      Number((match[2] ?? '0').padEnd(2, '0'))
    );
  }, 0);

  const whole = Math.floor(centavos / 100);
  const frac = centavos % 100;
  return `${whole}.${String(frac).padStart(2, '0')}`;
}

/**
 * `minuend - subtrahend`, exactly, clamped at zero.
 *
 * Same centavo arithmetic as `addDecimalStrings` and the same caveat: for
 * form-scale sums, not for reproducing server rollups. Clamped because the one
 * caller derives a remainder (a total minus its known parts) and a negative
 * remainder is a data problem, not a number to render as `-₱4.00`.
 */
export function subtractDecimalStrings(
  minuend: string,
  subtrahend: string,
): string {
  const toCentavos = (value: string) => {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
    if (!match) return 0;
    return Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  };
  const centavos = Math.max(0, toCentavos(minuend) - toCentavos(subtrahend));
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, '0')}`;
}

/**
 * Format a decimal string as pesos for display. Grouping only — the value is
 * already at the right scale, so this never re-does arithmetic on it.
 */
export function formatPeso(value: string): string {
  const [whole, frac = '00'] = value.split('.');
  return `\u20B1 ${groupDigits(whole)}.${frac.padEnd(2, '0')}`;
}

/**
 * Peso display without the centavos: `"1234567.89"` → `"₱ 1,234,567"`.
 *
 * For dashboard figures, where a column of `.00` endings is noise and the
 * numbers are large enough that two decimal places carry no signal. Truncates
 * rather than rounds — same reason as `formatPeso`, no arithmetic on money.
 */
export function formatPesoWhole(value: string): string {
  const [whole] = value.split('.');
  return `₱ ${groupDigits(whole || '0')}`;
}

/**
 * Group an integer-part digit string with thousands separators.
 *
 * String in, string out \u2014 no arithmetic, so a `Decimal(18,2)` value never
 * round-trips through a float just to gain commas. Shared by `formatPeso` and
 * the live masking in `components/custom/currency-input.tsx`.
 */
export function groupDigits(intPart: string): string {
  return intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Pad a decimal string to exactly two places: `"2500000"` \u2192 `"2500000.00"`.
 *
 * String manipulation rather than `toFixed`, for the same reason
 * `addDecimalStrings` counts centavos: money must not touch a float. Empty in,
 * empty out \u2014 an untouched optional field stays "not entered" rather than
 * becoming a real zero.
 */
export function padDecimalString(value: string): string {
  if (!value) return '';
  const [whole, frac = ''] = value.split('.');
  return `${whole || '0'}.${frac.slice(0, 2).padEnd(2, '0')}`;
}

/**
 * Compact peso for editorial display — `₱1.66B`, `₱147.87M`, `₱790K`.
 *
 * The public Overview leads with figures set at display sizes, where the full
 * `₱1,664,699,680.00` is a wall of digits nobody reads and the shape of the
 * number is the point. Precision lives one level down, in the tables and the
 * Browse page, which still print every centavo.
 *
 * Scale words rather than `Intl` compact notation on purpose: `notation:
 * 'compact'` renders "₱1.7B" in en-PH and drops the second decimal that
 * distinguishes ₱1.66B from ₱1.71B — a ₱50M difference the reader cannot see.
 */
export function compactPeso(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) || 0 : value;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const [divisor, suffix] =
    abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, ''];
  // Two decimals whenever a scale word is in play. Within a bucket the scaled
  // value is always under 1000, so the longest possible string is "₱999.99M" —
  // short enough at display size, and precise enough that ₱147.87M does not
  // collapse into the ₱147.9M that hides a ₱30,000 difference.
  const scaled = abs / divisor;
  return `${sign}₱${scaled.toFixed(suffix === '' ? 0 : 2)}${suffix}`;
}

/**
 * The same figure spelled out for a screen reader — "147.87 million pesos".
 *
 * `₱147.87M` is announced as "peso one hundred forty-seven point eight seven M"
 * by most screen readers, which is not a number anyone can hold. Pair this with
 * `compactPeso` as the `aria-label` on any display figure.
 */
export function spokenPeso(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) || 0 : value;
  const abs = Math.abs(n);
  const sign = n < 0 ? 'negative ' : '';
  const [divisor, word] =
    abs >= 1e9 ? [1e9, ' billion'] : abs >= 1e6 ? [1e6, ' million'] : abs >= 1e3 ? [1e3, ' thousand'] : [1, ''];
  const scaled = abs / divisor;
  const trimmed = Number(scaled.toFixed(word === '' ? 0 : 2)).toString();
  return `${sign}${trimmed}${word} pesos`;
}

/** Whole-peso figure with separators and no symbol — `1,664,699,680`. */
export function formatWholePesos(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) || 0 : value;
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(n);
}

/**
 * A table figure scaled to millions — `16.319M`, `2,338.429M`.
 *
 * Shared by the staff registry and the public Browse table, which are the same
 * component. One scale down a column is what makes rows comparable at a glance,
 * so this does **not** auto-scale by default: an office at ₱16M and one at
 * ₱2,338M have to line up.
 *
 * `autoScale` is the exception, for a grand total that has no column to line up
 * with — ₱6,067.751M reads as `PHP 6.068B` there. Every call site that uses it
 * pairs the figure with an exact-peso tooltip, which is what makes the rounding
 * safe.
 *
 * Three decimals in both scales: at millions that is the peso, and at billions
 * it keeps ₱6.067B distinct from ₱6.068B.
 */
export function formatMillions(
  amount?: number,
  options?: { includeCurrency?: boolean; autoScale?: boolean },
): string {
  if (!amount) return " - "

  const prefix = options?.includeCurrency ? "PHP " : ""
  // Decided on the *rendered* millions figure, not the raw one: ₱999,999,999
  // is 999.999999M, which rounds to three places as "1,000.000M" — a millions
  // label on a billion. Switch wherever the millions form would reach 1,000.
  const useBillions =
    options?.autoScale &&
    Number((Math.abs(amount) / 1_000_000).toFixed(3)) >= 1000
  const value = amount / (useBillions ? 1_000_000_000 : 1_000_000)
  const suffix = useBillions ? "B" : "M"

  if (Math.abs(value) > 0 && Math.abs(value) < 0.001) {
    return `${prefix}< 0.001${suffix}`
  }

  const formatted = new Intl.NumberFormat("en-PH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(value)

  return `${prefix}${formatted}${suffix}`
}
