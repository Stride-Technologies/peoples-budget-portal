import { toCsv } from './open-data.csv.js';

const BOM = String.fromCharCode(0xfeff);
const columns = [
  { name: 'a', csvName: 'col_a' },
  { name: 'b', csvName: 'col_b' },
];

describe('toCsv', () => {
  it('starts with the UTF-8 BOM so Excel reads ñ correctly', () => {
    expect(toCsv(columns, []).startsWith(BOM)).toBe(true);
  });

  it('writes the header from csvName and ends every row with CRLF', () => {
    expect(toCsv(columns, [{ a: 'x', b: 'y' }])).toBe(
      `${BOM}col_a,col_b\r\nx,y\r\n`,
    );
  });

  it('quotes fields with a comma, quote, CR or LF and doubles inner quotes', () => {
    const csv = toCsv(columns, [
      { a: 'Naga, City', b: 'say "hi"' },
      { a: 'line\nbreak', b: 'cr\rhere' },
    ]);
    expect(csv).toBe(
      `${BOM}col_a,col_b\r\n"Naga, City","say ""hi"""\r\n"line\nbreak","cr\rhere"\r\n`,
    );
  });

  it('writes null and undefined as empty and booleans as true/false', () => {
    expect(toCsv(columns, [{ a: null, b: undefined }])).toBe(
      `${BOM}col_a,col_b\r\n,\r\n`,
    );
    expect(toCsv(columns, [{ a: true, b: false }])).toBe(
      `${BOM}col_a,col_b\r\ntrue,false\r\n`,
    );
  });

  it('leaves plain text, ñ and money strings unquoted', () => {
    expect(toCsv(columns, [{ a: 'Peñafrancia', b: '32235000.00' }])).toBe(
      `${BOM}col_a,col_b\r\nPeñafrancia,32235000.00\r\n`,
    );
  });
});
