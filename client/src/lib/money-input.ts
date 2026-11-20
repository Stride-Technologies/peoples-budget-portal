/**
 * A peso amount as typed ("₱ 2,600,000,000") → the API's decimal string
 * ("2600000000"), or null unless it is a positive amount with at most two
 * decimals. Strings only: money is never a JS number here.
 */
export function parseMoneyInput(raw: string): string | null {
  const s = raw.replace(/[₱,\s]/g, '');
  if (!/^\d{1,16}(\.\d{1,2})?$/.test(s)) return null;
  if (/^0*(\.0*)?$/.test(s)) return null;
  return s;
}
