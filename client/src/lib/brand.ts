import { GOAL_VARS } from './goal-label.ts';
import { isPaletteId } from './palettes.ts';

/**
 * Who the portal belongs to: the LGU's names as pages, exports and metadata print them.
 * One per deployment, read from the `LGU_*` variables by `brandFromEnv` on the server and
 * handed to client components through <BrandProvider>.
 */
export interface Brand {
  /** `LGU_TYPE`: decides how copy words the LGU, its council and its chief executive (`messageVars`). */
  type: LguType;
  /** "City Government of San Isidro" */
  government: string;
  /** "City of San Isidro" */
  lguName: string;
  /** "San Isidro City": how running copy names the place */
  placeName: string;
  /** "San Isidro" */
  shortName: string;
  /** The province, or the region for an independent city. May be empty. */
  province: string;
  /** Browser title of the site: "San Isidro City Budget Portal" */
  siteName: string;
  /** Staff app header: "San Isidro Open Budget Portal" */
  staffAppName: string;
  sealAlt: string;
  /** The seal's path under `client/public`; null draws a monogram of the LGU's initials. */
  sealSrc: string | null;
  /** A palettes.ts id; null keeps the colours of globals.css. */
  palette: string | null;
  /** The LGU's own website (`LGU_WEBSITE`), linked from the footer; null leaves it out. */
  website: string | null;
  /** Postal address lines for the footer (`LGU_ADDRESS`, lines separated by `|`). */
  address: string[];
  /** Where the LGU posts budgets older than the portal holds (`LGU_BUDGET_ARCHIVE_URL`), and its first year (`LGU_BUDGET_ARCHIVE_FROM`). */
  budgetArchive: { url: string; from: number } | null;
  /** For download file names, as the API names them: "san-isidro" */
  slug: string;
  /** Where questions about the portal and personal data go (`LGU_CONTACT_EMAIL`, `LGU_CONTACT_PHONE`). */
  contactEmail: string | null;
  contactPhone: string | null;
  /**
   * The date the LGU put the privacy policy and terms into effect (`LEGAL_TEXT_EFFECTIVE`, as it should
   * read: "June 18, 2026"). Null means nobody has reviewed them: both pages say they are a template.
   */
  legalEffective: string | null;
}

const TYPES = ['city', 'municipality', 'province'] as const;
export type LguType = (typeof TYPES)[number];
const OFFICIAL = { city: 'City', municipality: 'Municipality', province: 'Province' } as const;
const LEVEL = { city: 'City', municipality: 'Municipal', province: 'Provincial' } as const;

/**
 * The deployment's identity. `LGU_SHORT_NAME`, `LGU_TYPE` (city, municipality or province)
 * and `LGU_PROVINCE` are enough; every derived name can be set outright when the LGU words
 * it differently. Server only: none of these are `NEXT_PUBLIC_`, so a browser reads the defaults.
 */
export function brandFromEnv(env: Record<string, string | undefined>): Brand {
  const set = (k: string): string | null => env[k]?.trim() || null;
  const shortName = set('LGU_SHORT_NAME') ?? 'Sample';
  const type = TYPES.find((t) => t === set('LGU_TYPE')) ?? 'city';
  const lguName = set('LGU_OFFICIAL_NAME') ?? `${OFFICIAL[type]} of ${shortName}`;
  const placeName = set('LGU_PLACE_NAME') ?? (type === 'city' ? `${shortName} City` : shortName);
  const palette = set('SITE_PALETTE');
  const archiveUrl = set('LGU_BUDGET_ARCHIVE_URL');
  const archiveFrom = Number(set('LGU_BUDGET_ARCHIVE_FROM'));
  return {
    type,
    government: set('LGU_GOVERNMENT') ?? `${LEVEL[type]} Government of ${shortName}`,
    lguName,
    placeName,
    shortName,
    province: set('LGU_PROVINCE') ?? '',
    siteName: set('SITE_NAME') ?? `${placeName} Budget Portal`,
    staffAppName: set('STAFF_APP_NAME') ?? `${shortName} Open Budget Portal`,
    sealAlt: `Seal of ${lguName.replace(/^(City|Municipality|Province) of /, 'the $1 of ')}`,
    sealSrc: set('LGU_SEAL_SRC'),
    palette: isPaletteId(palette) ? palette : null,
    website: set('LGU_WEBSITE'),
    address: (set('LGU_ADDRESS') ?? '').split('|').map((l) => l.trim()).filter(Boolean),
    slug: shortName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lgu',
    contactEmail: set('LGU_CONTACT_EMAIL'),
    contactPhone: set('LGU_CONTACT_PHONE'),
    legalEffective: set('LEGAL_TEXT_EFFECTIVE'),
    budgetArchive: archiveUrl && Number.isInteger(archiveFrom) && archiveFrom > 1900 ? { url: archiveUrl, from: archiveFrom } : null,
  };
}

// What running copy calls the LGU. The Filipino and Bikol nouns stand where a translation says
// "ng lungsod"; office and officer titles stay English in every language, as LGUs print them.
const NOUN: Record<string, Record<LguType, string>> = {
  en: { city: 'city', municipality: 'municipality', province: 'province' },
  fil: { city: 'lungsod', municipality: 'bayan', province: 'lalawigan' },
  bcl: { city: 'ciudad', municipality: 'banwaan', province: 'probinsya' },
};
const ADJECTIVE = { city: 'city', municipality: 'municipal', province: 'provincial' } as const;
const COUNCIL = {
  city: 'Sangguniang Panlungsod',
  municipality: 'Sangguniang Bayan',
  province: 'Sangguniang Panlalawigan',
} as const;
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * The slots every message and every piece of code-held copy can use without the caller passing
 * them: `{placeName}`, `{shortName}`, `{lguName}`, `{government}`, `{siteName}`, `{province}`,
 * the goal words of lib/goal-label.ts, and the words that follow `LGU_TYPE`: `{lgu}` / `{Lgu}`
 * ("city", "municipality", "province", in the page's language), `{lguAdj}` / `{LguAdj}` ("city",
 * "municipal", "provincial"), `{council}` ("Sangguniang Bayan") and `{Mayor}` ("Governor" for a
 * province). Write copy with these, never the bare word "city".
 */
export const messageVars = (brand: Brand, locale = 'en'): Record<string, string> => ({
  lgu: (NOUN[locale] ?? NOUN.en)[brand.type],
  Lgu: capital((NOUN[locale] ?? NOUN.en)[brand.type]),
  lguAdj: ADJECTIVE[brand.type],
  LguAdj: LEVEL[brand.type],
  council: COUNCIL[brand.type],
  Mayor: brand.type === 'province' ? 'Governor' : 'Mayor',
  placeName: brand.placeName,
  shortName: brand.shortName,
  lguName: brand.lguName,
  government: brand.government,
  siteName: brand.siteName,
  province: brand.province,
  ...GOAL_VARS,
});

/** What a page shows when nothing is configured, and what client code falls back to. */
export const DEFAULT_BRAND: Brand = brandFromEnv({});

/** Initials for the monogram seal: "San Fernando" → "SF". */
export const monogram = (shortName: string): string =>
  shortName
    .split(/[\s-]+/)
    .filter((w) => /^[A-Za-zÀ-ÿ]/.test(w) && !/^(of|de|del|la|the)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
