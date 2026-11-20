import { sourceLink } from './source-link';

describe('sourceLink', () => {
  const doc = {
    name: 'AIP.xlsx',
    url: 'https://docs.google.com/spreadsheets/d/x/edit',
    sheetGids: { 'GENERAL PUBLIC': '865094164' },
  };

  it('links a known tab at its row', () => {
    expect(sourceLink(doc, 'GENERAL PUBLIC!r8')).toEqual({
      file: 'AIP.xlsx',
      ref: 'GENERAL PUBLIC!r8',
      page: null,
      url: 'https://docs.google.com/spreadsheets/d/x/edit#gid=865094164&range=A8',
    });
  });

  it('falls back to the file for an unknown tab', () => {
    expect(sourceLink(doc, 'ECON!r305')?.url).toBe(doc.url);
  });

  it('keeps the page of a paged file, and opens a hosted PDF at it', () => {
    const pdf = {
      name: 'CHO-MVMM.pdf',
      url: 'https://www2.naga.gov.ph/x.pdf',
      sheetGids: {},
    };
    expect(sourceLink(pdf, 'row 7', 3)).toEqual({
      file: 'CHO-MVMM.pdf',
      ref: 'row 7',
      page: 3,
      url: 'https://www2.naga.gov.ph/x.pdf#page=3',
    });
  });

  it('cites a file nobody hosts without a link', () => {
    const held = { name: 'AB 2026.doc', url: null, sheetGids: {} };
    expect(sourceLink(held, 'table 2 row 11')).toEqual({
      file: 'AB 2026.doc',
      ref: 'table 2 row 11',
      page: null,
      url: null,
    });
  });

  it('is null without a document or a ref', () => {
    expect(sourceLink(null, 'ECON!r305')).toBeNull();
    expect(sourceLink(doc, null)).toBeNull();
  });
});
