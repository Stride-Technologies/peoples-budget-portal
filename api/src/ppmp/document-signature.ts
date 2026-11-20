import { extname } from 'node:path';

/**
 * The supporting-document types a PPMP line item accepts, keyed by file
 * extension. Each names the leading bytes every real file of that type starts
 * with, so the type is read from the content — the client's `Content-Type`
 * header is whatever the browser (or a script) says it is.
 */
const DOCUMENT_TYPES: Record<
  string,
  { mimetype: string; magic: number[]; contains?: string }
> = {
  '.pdf': {
    mimetype: 'application/pdf',
    magic: [0x25, 0x50, 0x44, 0x46, 0x2d],
  },
  '.jpg': { mimetype: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.jpeg': { mimetype: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
  '.png': {
    mimetype: 'image/png',
    magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  },
  // Legacy Office files are OLE compound documents — one signature for both.
  '.doc': {
    mimetype: 'application/msword',
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
  '.xls': {
    mimetype: 'application/vnd.ms-excel',
    magic: [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1],
  },
  // OOXML files are zips; the part directory names which one it is.
  '.docx': {
    mimetype:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    magic: [0x50, 0x4b, 0x03, 0x04],
    contains: 'word/',
  },
  '.xlsx': {
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    magic: [0x50, 0x4b, 0x03, 0x04],
    contains: 'xl/',
  },
};

/** The content type to serve a stored document's extension with. */
export function documentMimetypeForExtension(filename: string): string | null {
  return DOCUMENT_TYPES[extname(filename).toLowerCase()]?.mimetype ?? null;
}

/**
 * The document's real content type, or `null` when its extension is not an
 * accepted one or its bytes are not what the extension claims (an `.exe`
 * renamed `.pdf`, a zip renamed `.docx`).
 */
export function detectDocumentType(
  buffer: Buffer,
  originalname: string,
): string | null {
  const type = DOCUMENT_TYPES[extname(originalname).toLowerCase()];
  if (!type || buffer.length < type.magic.length) return null;
  if (!type.magic.every((byte, i) => buffer[i] === byte)) return null;
  // ponytail: substring scan of the zip's file names, not a zip parse — enough
  // to tell a Word file from an Excel one; a real parse if macros ever matter.
  if (type.contains && !buffer.includes(type.contains, 0, 'latin1'))
    return null;
  return type.mimetype;
}
