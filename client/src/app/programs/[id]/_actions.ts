"use server"

import { revalidatePath } from 'next/cache'
import { getSession } from '@/lib/session'
import {
  apiUpdateProgram,
  apiDeleteProgram,
  apiGetProgram,
  apiGetClimateTypologyCodes,
  apiUpsertProgramClimateTag,
  apiDeleteProgramClimateTag,
  apiListThematicTags,
  apiCreateThematicTag,
  apiApplyProgramThematicTag,
  apiRemoveProgramThematicTag,
  type ClimateCodeRecord,
  type ClimateTagRecord,
  type ProgramDetailRecord,
  type UpdateProgramPayload,
  type UpsertClimateTagPayload,
  type ThematicTagRecord,
  type ThematicTagRef,
} from '@/lib/api'

export async function updateProgramAction(
  programId: string,
  payload: UpdateProgramPayload,
): Promise<{ program: ProgramDetailRecord } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  if (!programId) return { error: 'Missing programId' }

  try {
    const program = await apiUpdateProgram(session.accessToken, programId, payload)
    try {
      revalidatePath('/aip-registry')
      revalidatePath('/dashboard')
      revalidatePath('/programs')
    } catch (err) {
      console.error('[updateProgramAction] revalidatePath failed', err)
    }
    return { program }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to update program.' }
  }
}

export async function deleteProgramAction(
  programId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const session = await getSession()
  if (!session) return { success: false, error: 'Your session has expired. Please sign in again.' }
  if (!programId) return { success: false, error: 'Missing programId' }

  try {
    await apiDeleteProgram(session.accessToken, programId)
    try {
      revalidatePath('/aip-registry')
      revalidatePath('/dashboard')
      revalidatePath('/programs')
    } catch (err) {
      console.error('[deleteProgramAction] revalidatePath failed', err)
    }
    return { success: true }
  } catch (err) {
    const error = err as Error & { statusCode?: number }
    if (error.statusCode === 403) {
      return { success: false, error: 'Cannot delete: program must be in DRAFT or FOR_REVISION status.' }
    }
    if (error.statusCode === 409) {
      return { success: false, error: 'Cannot delete: program has dependencies that must be removed first.' }
    }
    return { success: false, error: error.message ?? 'Failed to delete program. Please try again.' }
  }
}

/** The program's own climate tag and the CCET catalog, for the edit page's card. */
export async function loadProgramClimateTagAction(
  programId: string,
): Promise<{ tag: ClimateTagRecord | null; codes: ClimateCodeRecord[] } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  try {
    const [program, codes] = await Promise.all([
      apiGetProgram(session.accessToken, programId),
      apiGetClimateTypologyCodes(session.accessToken),
    ])
    return { tag: program.climateChangeTag ?? null, codes }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load the climate tag.' }
  }
}

export async function saveProgramClimateTagAction(
  programId: string,
  payload: UpsertClimateTagPayload | null,
): Promise<{ tag: ClimateTagRecord | null } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  try {
    if (!payload) {
      await apiDeleteProgramClimateTag(session.accessToken, programId)
      revalidatePath('/aip-registry')
      return { tag: null }
    }
    const tag = await apiUpsertProgramClimateTag(session.accessToken, programId, payload)
    revalidatePath('/aip-registry')
    return { tag }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to save the climate tag.' }
  }
}

// ─── Thematic tags ───────────────────────────────────────────────────────────

export async function loadThematicTagCatalogAction(): Promise<
  { catalog: ThematicTagRecord[] } | { error: string }
> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  try {
    const catalog = await apiListThematicTags(session.accessToken)
    return { catalog }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to load the thematic tag catalog.' }
  }
}

/** Finds-or-creates by name. Re-throws on failure (including the 409 close-match
 * shape) so the client picker can read it with `closeMatchFrom`. */
export async function createThematicTagAction(
  name: string,
  confirmNew?: boolean,
): Promise<ThematicTagRecord> {
  const session = await getSession()
  if (!session) throw new Error('Your session has expired. Please sign in again.')
  return apiCreateThematicTag(session.accessToken, { name, confirmNew })
}

export async function applyProgramThematicTagAction(
  programId: string,
  tagId: string,
): Promise<{ tags: ThematicTagRef[] } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  try {
    const tags = await apiApplyProgramThematicTag(session.accessToken, programId, tagId)
    revalidatePath('/aip-registry')
    return { tags }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to apply the tag.' }
  }
}

export async function removeProgramThematicTagAction(
  programId: string,
  tagId: string,
): Promise<{ tags: ThematicTagRef[] } | { error: string }> {
  const session = await getSession()
  if (!session) return { error: 'Your session has expired. Please sign in again.' }
  try {
    const tags = await apiRemoveProgramThematicTag(session.accessToken, programId, tagId)
    revalidatePath('/aip-registry')
    return { tags }
  } catch (err) {
    return { error: (err as Error).message ?? 'Failed to remove the tag.' }
  }
}
