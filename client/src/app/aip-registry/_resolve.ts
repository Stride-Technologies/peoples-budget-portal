import { getProgramDetail, getProjectActivityDetail } from './_actions';
import { registryPath, type RegistryTarget } from '@/lib/registry-paths';

export type PpaKind = 'program' | 'project' | 'activity';

/**
 * Where a PPA lives in the registry: its program and that program's fiscal year.
 * Null when a lookup fails (unknown id, no access) — callers fall back to `/aip-registry`.
 */
export async function resolvePpa(
  kind: PpaKind,
  id: string,
): Promise<{ year: number; target: RegistryTarget } | null> {
  let programId = id;
  let paId: string | undefined;
  if (kind !== 'program') {
    const pa = await getProjectActivityDetail(id);
    if ('error' in pa) return null;
    programId = pa.detail.programId;
    paId = id;
  }
  const program = await getProgramDetail(programId);
  if ('error' in program) return null;
  return {
    year: program.program.aipCycle.fiscalYear,
    target: { programId, ...(paId ? { paId } : {}) },
  };
}

/** A retired `/programs|projects|activities/:id/edit` route's new home. */
export async function ppaEditHref(kind: PpaKind, id: string): Promise<string> {
  const resolved = await resolvePpa(kind, id);
  return resolved ? registryPath(resolved.year, { ...resolved.target, edit: true }) : '/aip-registry';
}

/** A retired add-project/add-activity route's new home: the parent's year, create drawer open. */
export async function createUnderHref(kind: 'project' | 'activity', parentId: string): Promise<string> {
  const resolved = await resolvePpa(kind === 'project' ? 'program' : 'project', parentId);
  const query = `?open=${encodeURIComponent(parentId)}&kind=${kind}&mode=create`;
  return (resolved ? registryPath(resolved.year) : '/aip-registry') + query;
}
