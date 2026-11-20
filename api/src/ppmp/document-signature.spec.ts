import { detectDocumentType } from './document-signature.js';

const bytes = (...b: number[]) => Buffer.from(b);
const zipWith = (part: string) =>
  Buffer.concat([
    bytes(0x50, 0x4b, 0x03, 0x04),
    Buffer.from(`..${part}doc.xml`),
  ]);

describe('detectDocumentType', () => {
  it('reads the type from the bytes and the extension together', () => {
    expect(detectDocumentType(Buffer.from('%PDF-1.7 ...'), 'plan.PDF')).toBe(
      'application/pdf',
    );
    expect(detectDocumentType(bytes(0xff, 0xd8, 0xff, 0xe0), 'a.jpeg')).toBe(
      'image/jpeg',
    );
    expect(
      detectDocumentType(
        bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
        'a.png',
      ),
    ).toBe('image/png');
    expect(
      detectDocumentType(
        bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1),
        'old.xls',
      ),
    ).toBe('application/vnd.ms-excel');
    expect(detectDocumentType(zipWith('word/'), 'memo.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(detectDocumentType(zipWith('xl/'), 'sheet.xlsx')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  });

  it('rejects a file whose bytes are not what its name claims', () => {
    // An executable renamed to .pdf
    expect(
      detectDocumentType(Buffer.from('MZ\x90\x00'), 'invoice.pdf'),
    ).toBeNull();
    // A Word file renamed to .xlsx, and a plain zip renamed to .docx
    expect(detectDocumentType(zipWith('word/'), 'sheet.xlsx')).toBeNull();
    expect(detectDocumentType(zipWith('other/'), 'memo.docx')).toBeNull();
    // A PDF with no extension, an accepted signature under an unaccepted one
    expect(detectDocumentType(Buffer.from('%PDF-1.7'), 'plan')).toBeNull();
    expect(detectDocumentType(Buffer.from('%PDF-1.7'), 'page.html')).toBeNull();
    // Too short to carry the signature
    expect(detectDocumentType(bytes(0xff), 'a.jpg')).toBeNull();
  });
});
