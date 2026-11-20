import assert from 'node:assert/strict';
import { test } from 'node:test';
import { brandFromEnv, messageVars, monogram } from './brand.ts';

test('three variables name a city everywhere', () => {
  const b = brandFromEnv({ LGU_SHORT_NAME: 'San Isidro', LGU_TYPE: 'city', LGU_PROVINCE: 'Nueva Ecija' });
  assert.deepEqual(
    [b.government, b.lguName, b.placeName, b.siteName, b.staffAppName, b.sealAlt, b.province],
    ['City Government of San Isidro', 'City of San Isidro', 'San Isidro City', 'San Isidro City Budget Portal', 'San Isidro Open Budget Portal', 'Seal of the City of San Isidro', 'Nueva Ecija'],
  );
  assert.equal(b.sealSrc, null);
  assert.equal(b.palette, null);
  assert.equal(b.slug, 'san-isidro');
  assert.equal(brandFromEnv({ LGU_SHORT_NAME: 'Piñan' }).slug, 'pinan');
});

test('a municipality and a province are worded their own way', () => {
  const m = brandFromEnv({ LGU_SHORT_NAME: 'Aborlan', LGU_TYPE: 'municipality' });
  assert.deepEqual([m.government, m.lguName, m.placeName], ['Municipal Government of Aborlan', 'Municipality of Aborlan', 'Aborlan']);
  const p = brandFromEnv({ LGU_SHORT_NAME: 'Palawan', LGU_TYPE: 'province' });
  assert.deepEqual([p.government, p.lguName, p.placeName], ['Provincial Government of Palawan', 'Province of Palawan', 'Palawan']);
});

test('copy words the LGU, its council and its chief executive by type and language', () => {
  const words = (type: string, locale?: string) => {
    const v = messageVars(brandFromEnv({ LGU_TYPE: type }), locale);
    return [v.lgu, v.Lgu, v.lguAdj, v.LguAdj, v.council, v.Mayor];
  };
  assert.deepEqual(words('city'), ['city', 'City', 'city', 'City', 'Sangguniang Panlungsod', 'Mayor']);
  assert.deepEqual(words('municipality'), ['municipality', 'Municipality', 'municipal', 'Municipal', 'Sangguniang Bayan', 'Mayor']);
  assert.deepEqual(words('province', 'fil'), ['lalawigan', 'Lalawigan', 'provincial', 'Provincial', 'Sangguniang Panlalawigan', 'Governor']);
  assert.equal(words('municipality', 'xx')[0], 'municipality');
});

test('any derived name can be set outright; blanks and unknown values fall back', () => {
  const b = brandFromEnv({ LGU_SHORT_NAME: 'Naga', LGU_PLACE_NAME: 'Naga City', SITE_NAME: 'Budget ng Naga', LGU_SEAL_SRC: '/seal.png', SITE_PALETTE: 'forest', LGU_TYPE: 'barangay', LGU_GOVERNMENT: '  ' });
  assert.deepEqual([b.siteName, b.sealSrc, b.palette, b.lguName, b.government], ['Budget ng Naga', '/seal.png', 'forest', 'City of Naga', 'City Government of Naga']);
  assert.equal(brandFromEnv({ SITE_PALETTE: 'no-such' }).palette, null);
  assert.equal(brandFromEnv({}).shortName, 'Sample');
});

test('monogram takes the first two real words', () => {
  assert.equal(monogram('San Fernando'), 'SF');
  assert.equal(monogram('Cagayan de Oro'), 'CO');
  assert.equal(monogram(''), '?');
});
