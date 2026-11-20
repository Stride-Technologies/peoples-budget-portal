import { getBrand } from './brand.js';

describe('getBrand', () => {
  it('derives every name from three variables, as the client does', () => {
    expect(
      getBrand({
        LGU_SHORT_NAME: 'San Isidro',
        LGU_TYPE: 'city',
        FRONTEND_URL: 'https://budget.sanisidro.gov.ph/',
      }),
    ).toEqual({
      shortName: 'San Isidro',
      placeName: 'San Isidro City',
      lguName: 'City of San Isidro',
      government: 'City Government of San Isidro',
      siteName: 'San Isidro City Budget Portal',
      council: 'Sangguniang Panlungsod',
      level: 'City',
      chiefExecutive: 'City Mayor',
      siteUrl: 'https://budget.sanisidro.gov.ph',
      siteHost: 'budget.sanisidro.gov.ph',
      slug: 'san-isidro',
    });
  });

  it('words a municipality and a province their own way', () => {
    const m = getBrand({ LGU_SHORT_NAME: 'Aborlan', LGU_TYPE: 'municipality' });
    expect([m.placeName, m.lguName, m.government, m.council]).toEqual([
      'Aborlan',
      'Municipality of Aborlan',
      'Municipal Government of Aborlan',
      'Sangguniang Bayan',
    ]);
    expect(getBrand({ LGU_TYPE: 'province' }).council).toBe(
      'Sangguniang Panlalawigan',
    );
    expect(m.chiefExecutive).toBe('Municipal Mayor');
    expect(getBrand({ LGU_TYPE: 'province' }).chiefExecutive).toBe('Governor');
  });

  it('takes overrides, and falls back on blanks and unknown types', () => {
    const b = getBrand({
      LGU_SHORT_NAME: 'Piñan',
      LGU_PLACE_NAME: 'Piñan',
      SITE_NAME: ' ',
      LGU_TYPE: 'barangay',
    });
    expect([b.placeName, b.siteName, b.lguName, b.slug]).toEqual([
      'Piñan',
      'Piñan Budget Portal',
      'City of Piñan',
      'pinan',
    ]);
    expect(getBrand({}).slug).toBe('sample');
  });
});
