'use server';

import { revalidatePath } from 'next/cache';
import { getSession } from '@/lib/session';
import { apiCreateOffice, apiUpdateOffice, type Form7Column, type OfficeType } from '@/lib/api';

export type ActionState = { success: string } | { error: string } | undefined;

const PATH = '/control-panel/offices';

/**
 * Blank optional fields are omitted rather than sent: the API DTO rejects an
 * empty string, and a blank input means "not set", not "clear it".
 * ponytail: no way to unset a code once set — add one if that turns out to matter.
 */
function optional(formData: FormData, key: string): string | undefined {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : undefined;
}

/**
 * Free-text profile fields, where blank genuinely means "clear it" — someone
 * removing a vision statement they got wrong has no other way to do it. `null`
 * is what the API DTO takes for that, so blanks are sent rather than omitted.
 */
function clearable(formData: FormData, key: string): string | null {
  const value = (formData.get(key) as string | null)?.trim();
  return value ? value : null;
}

/** The LBP Form 7 fields; a blank column means unassigned. */
function form7(formData: FormData) {
  return {
    form7Column: ((formData.get('form7Column') as string | null) || null) as Form7Column | null,
  };
}

/** One outcome per line — each becomes its own row on the printed sheet. */
function lines(formData: FormData, key: string): string[] {
  return ((formData.get(key) as string | null) ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

export async function createOffice(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiCreateOffice(session.accessToken, {
      name: formData.get('name') as string,
      acronym: formData.get('acronym') as string,
      clusterId: formData.get('clusterId') as string,
      officeCode: optional(formData, 'officeCode'),
      officeType: optional(formData, 'officeType') as OfficeType | undefined,
      papSectorId: optional(formData, 'papSectorId'),
      canEndorse: formData.get('canEndorse') === 'true',
      mandateLegalBasis: clearable(formData, 'mandateLegalBasis'),
      vision: clearable(formData, 'vision'),
      mission: clearable(formData, 'mission'),
      organizationalOutcomes: lines(formData, 'organizationalOutcomes'),
      ...form7(formData),
    });
    revalidatePath(PATH);
    return { success: 'Office added.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to add office.' };
  }
}

export async function updateOffice(
  id: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await getSession();
  if (!session) return { error: 'Unauthorized.' };
  try {
    await apiUpdateOffice(session.accessToken, id, {
      name: formData.get('name') as string,
      acronym: formData.get('acronym') as string,
      clusterId: optional(formData, 'clusterId'),
      officeCode: optional(formData, 'officeCode'),
      officeType: optional(formData, 'officeType') as OfficeType | undefined,
      papSectorId: optional(formData, 'papSectorId'),
      canEndorse: formData.get('canEndorse') === 'true',
      isActive: formData.get('isActive') === 'true',
      mandateLegalBasis: clearable(formData, 'mandateLegalBasis'),
      vision: clearable(formData, 'vision'),
      mission: clearable(formData, 'mission'),
      organizationalOutcomes: lines(formData, 'organizationalOutcomes'),
      ...form7(formData),
    });
    revalidatePath(PATH);
    return { success: 'Office updated.' };
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update office.' };
  }
}

/** One staged row from the grid. Only the inline-editable fields. */
export type OfficeEdit = {
  id: string;
  officeCode?: string;
  officeType?: OfficeType;
  clusterId?: string;
  /** `null` clears the office's PAP sector; `undefined` leaves it alone. */
  papSectorId?: string | null;
};

/**
 * Apply the grid's staged edits.
 *
 * One `PATCH` per changed row rather than a bulk endpoint: `officeCode` has no
 * unique constraint any more, so rows cannot collide with each other mid-write
 * — the reason the old DBM-office bulk endpoint needed a two-pass sentinel.
 *
 * Not atomic. `savedIds` reports exactly which rows landed so the caller can
 * clear those and leave the rest staged instead of losing the user's work.
 *
 * ponytail: N sequential PATCHes, each resyncing that office's tentative AIP
 * codes when its code or type moved. Add a bulk endpoint if transcribing the
 * whole catalog in one sitting gets slow.
 */
export async function saveOfficeEdits(
  edits: OfficeEdit[],
): Promise<{ savedIds: string[]; error?: string }> {
  const session = await getSession();
  if (!session) return { savedIds: [], error: 'Unauthorized.' };

  const savedIds: string[] = [];
  for (const edit of edits) {
    const { id, ...rest } = edit;
    try {
      await apiUpdateOffice(session.accessToken, id, rest);
      savedIds.push(id);
    } catch (err) {
      revalidatePath(PATH);
      return {
        savedIds,
        error:
          `${(err as Error).message ?? 'Save failed'} — ` +
          `${savedIds.length} of ${edits.length} change(s) applied; the rest are still pending.`,
      };
    }
  }
  revalidatePath(PATH);
  return { savedIds };
}
