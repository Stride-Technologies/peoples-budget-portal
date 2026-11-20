/**
 * Staff registry URLs: `/aip-registry/<year>[/program/<programId>[/<paId>]][/edit]`.
 *
 * Same shape as the public pages (`/<section>/<year>/<kind>/<id>`); a project or
 * activity nests under its program like the public `/budget/<programId>/<paId>`.
 * The path is the source of truth for which drawer the registry has open.
 */

export const REGISTRY_BASE = '/aip-registry'

export interface RegistryTarget {
  programId: string
  /** A project or activity under `programId`. */
  paId?: string
  edit?: boolean
}

export interface ParsedRegistryPath {
  year: number
  target: RegistryTarget | null
}

export function registryPath(year: number | string, target?: RegistryTarget | null): string {
  let path = `${REGISTRY_BASE}/${year}`
  if (!target) return path
  path += `/program/${encodeURIComponent(target.programId)}`
  if (target.paId) path += `/${encodeURIComponent(target.paId)}`
  if (target.edit) path += '/edit'
  return path
}

/** Parses the segments after the year (Next's `[[...ppa]]`); null when they name no valid shape. */
export function parseRegistrySegments(segments: string[]): RegistryTarget | null | undefined {
  if (segments.length === 0) return null
  const [kind, programId, ...rest] = segments
  if (kind !== 'program' || !programId || programId === 'edit') return undefined
  const edit = rest[rest.length - 1] === 'edit'
  const tail = edit ? rest.slice(0, -1) : rest
  if (tail.length > 1) return undefined
  const paId = tail[0]
  return { programId, ...(paId ? { paId } : {}), ...(edit ? { edit } : {}) }
}

/** Parses a full pathname; null when it is not a registry year path or its tail is malformed. */
export function parseRegistryPath(pathname: string): ParsedRegistryPath | null {
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (`/${parts[0]}` !== REGISTRY_BASE || !/^\d{4}$/.test(parts[1] ?? '')) return null
  const target = parseRegistrySegments(parts.slice(2))
  if (target === undefined) return null
  return { year: Number(parts[1]), target }
}
