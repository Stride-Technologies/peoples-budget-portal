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
    const text = String(value);
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
