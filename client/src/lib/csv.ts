/** One CSV field: formula-neutralised, then RFC 4180 quoted. */
export function csvCell(raw: string): string {
  // Residents write these messages. A cell starting = + - @ (or tab/CR) is a
  // formula to Excel, LibreOffice and Sheets, so prefix it with ' and it stays
  // text (security audit NV2). Plain numbers are left alone.
  const value =
    /^[=+\-@\t\r]/.test(raw) && !/^[-+]?\d+(\.\d+)?$/.test(raw) ? `'${raw}` : raw;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
