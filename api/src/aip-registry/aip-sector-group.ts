import { AipSectorGroup } from '../generated/prisma/index';

/**
 * The four sheets of the complete-AIP workbook, in printed order.
 *
 * This mirrors the budget office's own working file (`EXPEN_AIP <FY>.xlsx`),
 * whose split is editorial: it cuts across `PAPSector` (only three of the seven
 * are in use) and across `Cluster` (eight), so neither can derive it. Hence a
 * group of its own rather than a query over either.
 */
export const SECTOR_GROUP_ORDER = [
  AipSectorGroup.GENERAL_PUBLIC,
  AipSectorGroup.ECONOMIC,
  AipSectorGroup.ENVI_INFRA,
  AipSectorGroup.SOCIAL,
] as const;

/** Sheet name — kept to the short forms the budget office already reads. */
export const SECTOR_GROUP_SHEET_NAMES: Record<AipSectorGroup, string> = {
  GENERAL_PUBLIC: 'GENERAL PUBLIC',
  ECONOMIC: 'ECONOMIC',
  ENVI_INFRA: 'ENVIINFRA',
  SOCIAL: 'SOCIAL',
};

/** The title printed above each sheet's header row, and on the Fund Source blocks. */
export const SECTOR_GROUP_LABELS: Record<AipSectorGroup, string> = {
  GENERAL_PUBLIC: 'General Public Services',
  ECONOMIC: 'Economic Services',
  ENVI_INFRA: 'Environmental and Infrastructure Services',
  SOCIAL: 'Social Services',
};

/**
 * Fallback from the office's PAP sector, used whenever `aipSectorGroup` is null
 * — which is the normal case, since the column only records the nine offices
 * the workbook files against their sector.
 *
 * Codes are the DBM BOM Annex 2 sectors seeded in `pap-sectors.json`. 6000 and
 * 8000 are the two economic sectors; 4000/5000 (Education, Health) print under
 * Social, which is where the workbook puts every school and hospital office.
 */
const GROUP_BY_SECTOR_CODE: Record<string, AipSectorGroup> = {
  '1000': AipSectorGroup.GENERAL_PUBLIC,
  '9000': AipSectorGroup.GENERAL_PUBLIC,
  '3000': AipSectorGroup.SOCIAL,
  '4000': AipSectorGroup.SOCIAL,
  '5000': AipSectorGroup.SOCIAL,
  '6000': AipSectorGroup.ECONOMIC,
  '8000': AipSectorGroup.ECONOMIC,
};

/**
 * Which sheet an office prints on: its explicit override, else its sector's
 * group, else General Public.
 *
 * The last fallback matters — an office with no sector at all (a new one an
 * admin has not coded yet) still has programs, and dropping it would silently
 * shrink the city's total.
 */
export function resolveSectorGroup(office: {
  aipSectorGroup: AipSectorGroup | null;
  papSector: { code: string } | null;
}): AipSectorGroup {
  if (office.aipSectorGroup) return office.aipSectorGroup;
  const code = office.papSector?.code;
  return (
    (code ? GROUP_BY_SECTOR_CODE[code] : undefined) ??
    AipSectorGroup.GENERAL_PUBLIC
  );
}
