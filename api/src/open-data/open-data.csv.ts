/**
 * RFC 4180 CSV: a field containing `,` `"` CR or LF is quoted and its quotes
 * doubled; rows end in CRLF. The UTF-8 BOM makes Excel read ñ and accented
 * names as UTF-8 instead of the system code page.
 */
const BOM = String.fromCharCode(0xfeff);

type Cell = string | number | boolean | null | undefined;

export function toCsv(
  columns: ReadonlyArray<{ name: string; csvName: string }>,
  rows: ReadonlyArray<object>,
): string {
  const field = (value: Cell): string => {
    // Rows hold strings, numbers, booleans and nulls only (open-data.mapper.ts).
    if (value === null || value === undefined) return '';
    // A text cell starting = + - @ (or tab/CR) is a formula to spreadsheet
    // apps: prefix it with ' so it stays text. Numbers, including negative
    // amounts, are left as they are.
    const raw = String(value);
    const text =
      typeof value === 'string' &&
      /^[=+\-@\t\r]/.test(raw) &&
      !/^[-+]?\d+(\.\d+)?$/.test(raw)
        ? `'${raw}`
        : raw;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [
    columns.map((c) => field(c.csvName)).join(','),
    ...rows.map((row) =>
      columns
        .map((c) => field((row as Record<string, Cell>)[c.name]))
        .join(','),
    ),
  ];
  return `${BOM}${lines.join('\r\n')}\r\n`;
}
