/**
 * Whose portal this is, as the API prints it (exports, e-mail, open data). The same `LGU_*`
 * variables and the same derivation as the client (client/src/lib/brand.ts): keep the two in step.
 */
export interface Brand {
  /** "San Isidro" */
  shortName: string;
  /** "San Isidro City": how running copy and budget documents name the place */
  placeName: string;
  /** "City of San Isidro" */
  lguName: string;
  /** "City Government of San Isidro" */
  government: string;
  /** "San Isidro City Budget Portal" */
  siteName: string;
  /** The body that enacts the budget: "Sangguniang Panlungsod" for a city */
  council: string;
  /** How the LGU's own officers are titled: "City", "Municipal" or "Provincial" */
  level: string;
  /** The local chief executive's title: "City Mayor", "Municipal Mayor" or "Governor" */
  chiefExecutive: string;
  /** The public site's address (`FRONTEND_URL`), without a trailing slash */
  siteUrl: string;
  /** `siteUrl` without the scheme: "budget.sanisidro.gov.ph" */
  siteHost: string;
  /** For file names: "san-isidro" */
  slug: string;
}

const TYPES = ['city', 'municipality', 'province'] as const;
const OFFICIAL = {
  city: 'City',
  municipality: 'Municipality',
  province: 'Province',
} as const;
const LEVEL = {
  city: 'City',
  municipality: 'Municipal',
  province: 'Provincial',
} as const;
const COUNCIL = {
  city: 'Sangguniang Panlungsod',
  municipality: 'Sangguniang Bayan',
  province: 'Sangguniang Panlalawigan',
} as const;

export function getBrand(
  env: Record<string, string | undefined> = process.env,
): Brand {
  const set = (key: string): string | null => env[key]?.trim() || null;
  const shortName = set('LGU_SHORT_NAME') ?? 'Sample';
  const type = TYPES.find((t) => t === set('LGU_TYPE')) ?? 'city';
  const placeName =
    set('LGU_PLACE_NAME') ??
    (type === 'city' ? `${shortName} City` : shortName);
  const siteUrl = (set('FRONTEND_URL') ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );
  return {
    shortName,
    placeName,
    lguName: set('LGU_OFFICIAL_NAME') ?? `${OFFICIAL[type]} of ${shortName}`,
    government:
      set('LGU_GOVERNMENT') ?? `${LEVEL[type]} Government of ${shortName}`,
    siteName: set('SITE_NAME') ?? `${placeName} Budget Portal`,
    council: COUNCIL[type],
    level: LEVEL[type],
    chiefExecutive: type === 'province' ? 'Governor' : `${LEVEL[type]} Mayor`,
    siteUrl,
    siteHost: siteUrl.replace(/^https?:\/\//, ''),
    slug:
      shortName
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'lgu',
  };
}

/** The place name budget documents print ("San Isidro City"). */
export const getPlaceName = (): string => getBrand().placeName;

/**
 * What this LGU calls its top-level goals ("finish lines" in the schema). The same setting the
 * client is built with (client/src/lib/goal-label.ts): give the API the same two variables.
 */
export const GOAL =
  process.env.NEXT_PUBLIC_GOAL_NAME?.trim() || 'Development Priority';
export const GOALS =
  process.env.NEXT_PUBLIC_GOALS_NAME?.trim() || 'Development Priorities';
