import type { FundSource, PapClass } from './schemas';

const API_URL = process.env.API_URL ?? 'http://localhost:8000/api/v1';

/**
 * How long a public GET may be served from Next's data cache.
 *
 * Public budget data only changes when an office publishes, which is a handful of
 * times a day at most, and every one of these pages fetches the *whole* cycle.
 * Without this each navigation re-fetched and re-rendered several hundred
 * programmes from scratch.
 *
 * Only applied to the unauthenticated `/public/*` reads — an authenticated
 * response must never be cached across requests, since it is scoped to a session.
 */
const PUBLIC_REVALIDATE_SECONDS = 300;

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
  options?: { revalidate?: number },
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    ...(options?.revalidate !== undefined ? { next: { revalidate: options.revalidate } } : {}),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string | string[]; statusCode?: number; [key: string]: unknown };
    const raw = body.message;
    const message = Array.isArray(raw) ? raw.slice(0, 2).join('; ') + (raw.length > 2 ? ` and ${raw.length - 2} more` : '') : (raw ?? res.statusText);
    const err = new Error(message) as Error & { statusCode: number; body: typeof body };
    err.statusCode = body.statusCode ?? res.status;
    // Carries the rest of a structured error body (e.g. a 409's `closeMatch`
    // hint) for call sites that need more than a display message.
    err.body = body;
    throw err;
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * The visitor's IP, for the API's rate limits. Server actions call the API from
 * the client container, so without this every visitor shares one bucket. The
 * caller reads it with `visitorIp()` (`@/lib/visitor-ip`, server-only).
 */
function visitorHeaders(ip?: string | null): HeadersInit | undefined {
  return ip ? { 'X-Real-IP': ip } : undefined;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function apiLogin(email: string, password: string, ip?: string | null) {
  return apiFetch<TokenPair>('/auth/login', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify({ email, password }),
  });
}

export function apiVerifyEmail(
  email: string,
  code: string,
  challenge: string,
  ip?: string | null,
) {
  return apiFetch<TokenPair>('/auth/verify-email', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify({ email, code, challenge }),
  });
}

export function apiLogout(refreshToken: string) {
  return apiFetch<{ message: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
}

export function apiSetPassword(
  payload: {
    token: string;
    password: string;
    confirmPassword: string;
  },
  ip?: string | null,
) {
  return apiFetch<TokenPair>('/auth/set-password', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(payload),
  });
}

export function apiForgotPassword(email: string, ip?: string | null) {
  return apiFetch<{ message: string }>('/auth/forgot-password', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify({ email }),
  });
}

export function apiResetPassword(
  payload: {
    token: string;
    password: string;
    confirmPassword: string;
  },
  ip?: string | null,
) {
  return apiFetch<TokenPair>('/auth/reset-password', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(payload),
  });
}

export function apiChangePassword(
  token: string,
  payload: {
    currentPassword: string;
    newPassword: string;
    confirmPassword: string;
  },
) {
  return apiFetch<TokenPair>('/auth/change-password', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export interface InvitePreview {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  identityType: string | null;
  officeName: string | null;
}

export function apiPreviewInvite(token: string, ip?: string | null) {
  return apiFetch<InvitePreview>('/auth/invite-preview', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify({ token }),
  });
}

// ─── Authenticated helper ────────────────────────────────────────────────────

function apiFetchAuth<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
}

// ─── Users ───────────────────────────────────────────────────────────────────

export interface UserRecord {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  identityType: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  lguusers: { officeId: string }[];
  ncpcusers: { civilSocietyOrganizationId: string }[];
  userInvites: { expiresAt: string }[];
}

export interface InviteUserPayload {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  identityType?: string;
  officeId?: string;
  civilSocietyOrganizationId?: string;
  /** Applied when the invite is accepted (Phase 1 §5). */
  permissions?: string[];
  allOfficesScope?: boolean;
  officeScopeIds?: string[];
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  role?: string;
  officeId?: string;
  civilSocietyOrganizationId?: string;
  isActive?: boolean;
}

export type UserAuditAction =
  | 'ROLE_CHANGED'
  | 'OFFICE_CHANGED'
  | 'ACTIVATED'
  | 'DEACTIVATED'
  | 'PROFILE_UPDATED'
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'PASSWORD_CHANGED'
  | 'PASSWORD_RESET_REQUESTED'
  | 'PASSWORD_RESET';

export interface UserAuditLogRecord {
  id: string;
  action: UserAuditAction;
  summary: string;
  metadata: unknown;
  actorRole: string;
  createdAt: string;
  actor: { firstName: string; lastName: string; email: string };
}

export interface MyProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  identityType: string | null;
  isEmailVerified: boolean;
  isActive: boolean;
  createdAt: string;
  officeName: string | null;
}

export function apiGetMe(token: string) {
  return apiFetchAuth<MyProfile>(token, '/users/me');
}

export function apiUpdateMe(
  token: string,
  payload: { firstName?: string; lastName?: string },
) {
  return apiFetchAuth<MyProfile>(token, '/users/me', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiGetMyAuditLogs(token: string) {
  return apiFetchAuth<UserAuditLogRecord[]>(token, '/users/me/audit-logs');
}

export function apiGetUsers(token: string) {
  return apiFetchAuth<UserRecord[]>(token, '/users');
}

export function apiUpdateUser(
  token: string,
  id: string,
  payload: UpdateUserPayload,
) {
  return apiFetchAuth<UserRecord>(token, `/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─── Permissions & office scope (Phase 1 §5) ────────────────────────────────

export interface PermissionDefinition {
  key: string;
  label: string;
  module: string;
  description: string;
  /** False for keys reserved for a later phase: grantable, but gating nothing yet. */
  enforced: boolean;
}

export interface PermissionCatalog {
  permissions: PermissionDefinition[];
  /** Preset name → the keys it grants. Applying one materializes rows. */
  templates: Record<string, string[]>;
}

export interface UserGrants {
  permissions: string[];
  allOfficesScope: boolean;
  officeIds: string[];
}

export interface UpdateGrantsPayload {
  permissions?: string[];
  allOfficesScope?: boolean;
  officeIds?: string[];
}

export function apiGetPermissionCatalog(token: string) {
  return apiFetchAuth<PermissionCatalog>(token, '/permissions/catalog');
}

export function apiGetUserGrants(token: string, id: string) {
  return apiFetchAuth<UserGrants>(token, `/users/${id}/grants`);
}

/**
 * Replace-set on both dimensions. An omitted field leaves its dimension
 * untouched, so the permissions grid and the office picker can save separately.
 */
export function apiUpdateUserGrants(
  token: string,
  id: string,
  payload: UpdateGrantsPayload,
) {
  return apiFetchAuth<UserGrants>(token, `/users/${id}/grants`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export function apiGetUserAuditLog(token: string, id: string) {
  return apiFetchAuth<UserAuditLogRecord[]>(token, `/users/${id}/audit-logs`);
}

export function apiInviteUser(token: string, payload: InviteUserPayload) {
  return apiFetchAuth<{ message: string }>(token, '/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiResendInvite(token: string, inviteId: string) {
  return apiFetchAuth<{ message: string }>(token, `/users/invites/${inviteId}/resend`, {
    method: 'POST',
  });
}

export function apiRevokeInvite(token: string, inviteId: string) {
  return apiFetchAuth<{ message: string }>(token, `/users/invites/${inviteId}/revoke`, {
    method: 'POST',
  });
}

export interface DevMailOutboxItem {
  id: string;
  to: string;
  subject: string;
  timestamp: string;
  messageType: string;
  copyValue: string | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
}

export function apiGetDevMailOutbox(token: string) {
  return apiFetchAuth<DevMailOutboxItem[]>(token, '/mail/outbox');
}

// ─── Reference ───────────────────────────────────────────────────────────────

export type OfficeType = 'MANDATORY' | 'OPTIONAL' | 'OTHERS';

export interface OfficeRecord {
  id: string;
  name: string;
  acronym: string;
  /**
   * AIP code segment 4. Free text ("01", or "11 (1)" where two offices share a
   * base code) and deliberately not unique — see the office form's warning.
   * Stored the way the coding sheet writes it; the emitted segment strips the
   * space.
   */
  officeCode: string | null;
  officeType: OfficeType | null;
  lguLevel: number;
  canEndorse: boolean;
  isActive: boolean;
  /**
   * The header block of the office's printed AB sheet. All optional — the city
   * leaves Vision and Mission blank on several sheets.
   */
  mandateLegalBasis?: string | null;
  vision?: string | null;
  mission?: string | null;
  organizationalOutcomes?: string[];
  clusterId: string;
  cluster: { id: string; name: string; fullName: string | null };
  /**
   * The office's usual PAP sector, used to pre-select the sector on the
   * new-program form. Advisory only — the AIP code's sector segment comes from
   * the program, so changing this never moves a reference code.
   */
  papSectorId: string | null;
  papSector: { id: string; code: string; name: string } | null;
  /** LBP Form 7 column (specs/008). null = unassigned. */
  form7Column?: Form7Column | null;
}

export type Form7Column = 'GENERAL_PUBLIC' | 'SOCIAL' | 'ECONOMIC' | 'ECONOMIC_ENTERPRISE';

/** A special fund's stated amount and the figure Form 7 prints (staff-only). */
export interface SpecialFundRecord {
  /** SPA, LDF or LDRRMF. */
  fund: string;
  name: string;
  statedAmount: string | null;
  note: string | null;
  programTotal: string;
  programCount: number;
  figure: string;
  flags: Array<'STATED_WITHOUT_PPAS' | 'STATED_DIFFERS'>;
}

export function apiGetSpecialFunds(token: string, cycleId: string) {
  return apiFetchAuth<SpecialFundRecord[]>(token, `/aip-cycles/${cycleId}/special-funds`);
}

export function apiSetSpecialFund(
  token: string,
  cycleId: string,
  fund: string,
  payload: { statedAmount: string | null; note?: string },
) {
  return apiFetchAuth<SpecialFundRecord>(token, `/aip-cycles/${cycleId}/special-funds/${fund}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// ─── AIP-Extended upload (specs/008 US3) ─────────────────────────────────────

/** A program as the AIP-Extended matching screen shows it. */
export interface AipExtendedEntry {
  id: string;
  code: string;
  aipReferenceCode: string | null;
  name: string;
  officeAcronym: string | null;
  status: string;
  proposedTotal: string;
  majorFinalOutput: string | null;
  expectedOutput: string | null;
  targetForBudgetYear: string | null;
  sdgCodes: string[];
}

export interface AipExtendedPreviewRow {
  row: number;
  aipCode: string;
  description: string;
  indicator: string;
  target: string;
  sdgCodes: string[];
  unknownSdgCodes: string[];
  /** The code appears more than once in the sheet. */
  duplicate: boolean;
  match: 'exact' | 'ambiguous' | 'none';
  matchIds: string[];
  /** Entries equal on every code segment but the office type. */
  suggestionIds: string[];
}

export interface AipExtendedPreview {
  fileName: string;
  sheet: string;
  year: number;
  rows: AipExtendedPreviewRow[];
  unreadSdg: { row: number; text: string }[];
  entries: AipExtendedEntry[];
}

export interface AipExtendedApplyResult {
  filled: { programId: string; code: string; fields: string[] }[];
  conflicts: { sheetRow: number; code: string; field: string; portal: string; sheet: string }[];
  unchanged: number;
}

/** Multipart, like `apiUploadPpmpLineItemDocument`: the browser sets the boundary. */
export async function apiPreviewAipExtended(
  token: string,
  cycleId: string,
  file: File,
): Promise<AipExtendedPreview> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/aip-cycles/${cycleId}/aip-extended/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const raw = body.message;
    throw new Error(Array.isArray(raw) ? raw.join('; ') : (raw ?? res.statusText));
  }
  return res.json();
}

export function apiApplyAipExtended(
  token: string,
  cycleId: string,
  payload: {
    fileName?: string;
    rows: {
      programId: string;
      sheetRow: number;
      aipCode: string;
      indicator: string;
      target: string;
      sdgCodes: string[];
    }[];
  },
) {
  return apiFetchAuth<AipExtendedApplyResult>(token, `/aip-cycles/${cycleId}/aip-extended/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface ClusterRecord {
  id: string;
  name: string;
  fullName: string | null;
  offices: Pick<
    OfficeRecord,
    'id' | 'name' | 'acronym' | 'officeCode' | 'officeType' | 'isActive'
  >[];
  finishLineClusters: {
    finishLine: { id: string; name: string; visionNumber: number | null };
  }[];
}

export interface SubFinishLineRecord {
  id: string;
  code: string;
  name: string;
  finishLineId: string;
  isActive: boolean;
}

export interface FinishLineRecord {
  id: string;
  name: string;
  fullName: string;
  visionNumber: number | null;
  shortName: string | null;
  color: string | null;
  finishLineClusters: { cluster: { id: string; name: string } }[];
  subFinishLines: SubFinishLineRecord[];
}

export function apiGetClusters(token: string) {
  return apiFetchAuth<ClusterRecord[]>(token, '/reference/clusters');
}

/** The offices the caller may act on. `allOffices` means every city office. */
export function apiGetMyOfficeScope(token: string) {
  return apiFetchAuth<{ allOffices: boolean; officeIds: string[] }>(
    token,
    '/permissions/me/offices',
  );
}

export function apiGetClustersAdmin(token: string) {
  return apiFetchAuth<ClusterRecord[]>(token, '/reference/clusters/all');
}

export function apiUpdateCluster(
  token: string,
  id: string,
  payload: { name?: string; fullName?: string },
) {
  return apiFetchAuth<ClusterRecord>(token, `/reference/clusters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiGetOffices(token: string) {
  return apiFetchAuth<OfficeRecord[]>(token, '/reference/offices');
}

export function apiGetOfficesAll(token: string) {
  return apiFetchAuth<OfficeRecord[]>(token, '/reference/offices/all');
}

export function apiCreateOffice(
  token: string,
  payload: {
    name: string;
    acronym: string;
    clusterId: string;
    officeCode?: string;
    officeType?: OfficeType;
    papSectorId?: string;
    canEndorse?: boolean;
    /** AB sheet header block. `null` clears a field; not AIP code segments. */
    mandateLegalBasis?: string | null;
    vision?: string | null;
    mission?: string | null;
    /** One entry per printed row on the sheet. */
    organizationalOutcomes?: string[];
    form7Column?: Form7Column | null;
  },
) {
  return apiFetchAuth<OfficeRecord>(token, '/reference/offices', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Editing `officeCode` or `officeType` resyncs the tentative AIP code of every
 * PPA under the office — both are AIP code segments.
 */
export function apiUpdateOffice(
  token: string,
  id: string,
  payload: {
    name?: string;
    acronym?: string;
    clusterId?: string;
    officeCode?: string;
    officeType?: OfficeType;
    /** `null` clears the office's PAP sector. */
    papSectorId?: string | null;
    canEndorse?: boolean;
    isActive?: boolean;
    /** AB sheet header block. `null` clears a field; not AIP code segments. */
    mandateLegalBasis?: string | null;
    vision?: string | null;
    mission?: string | null;
    /** One entry per printed row on the sheet. */
    organizationalOutcomes?: string[];
    form7Column?: Form7Column | null;
  },
) {
  return apiFetchAuth<OfficeRecord>(token, `/reference/offices/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeactivateOffice(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(token, `/reference/offices/${id}`, {
    method: 'DELETE',
  });
}

export function apiGetFinishLines(token: string) {
  return apiFetchAuth<FinishLineRecord[]>(token, '/reference/finish-lines');
}

export function apiUpdateFinishLine(
  token: string,
  id: string,
  payload: {
    name?: string;
    fullName?: string;
    visionNumber?: number;
    shortName?: string;
    color?: string;
  },
) {
  return apiFetchAuth<FinishLineRecord>(token, `/reference/finish-lines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiCreateSubFinishLine(
  token: string,
  payload: { code: string; name: string; finishLineId: string },
) {
  return apiFetchAuth<SubFinishLineRecord>(token, '/reference/sub-finish-lines', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdateSubFinishLine(
  token: string,
  id: string,
  payload: { code?: string; name?: string; isActive?: boolean },
) {
  return apiFetchAuth<SubFinishLineRecord>(token, `/reference/sub-finish-lines/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeactivateSubFinishLine(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(token, `/reference/sub-finish-lines/${id}`, {
    method: 'DELETE',
  });
}

export interface PapSectorRecord {
  id: string;
  code: string;
  name: string;
  subsectorCode: string | null;
  isActive: boolean;
}

export function apiGetPapSectors(token: string) {
  return apiFetchAuth<PapSectorRecord[]>(token, '/reference/pap-sectors');
}

export function apiGetPapSectorsAll(token: string) {
  return apiFetchAuth<PapSectorRecord[]>(token, '/reference/pap-sectors/all');
}

export function apiCreatePapSector(
  token: string,
  payload: { code: string; name: string; subsectorCode?: string },
) {
  return apiFetchAuth<PapSectorRecord>(token, '/reference/pap-sectors', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdatePapSector(
  token: string,
  id: string,
  payload: { name?: string; subsectorCode?: string; isActive?: boolean },
) {
  return apiFetchAuth<PapSectorRecord>(token, `/reference/pap-sectors/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeactivatePapSector(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/pap-sectors/${id}`,
    { method: 'DELETE' },
  );
}

export interface UacsObjectRecord {
  id: string;
  code: string;
  description: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  isActive: boolean;
}

export function apiGetUacsObjectsAll(token: string) {
  return apiFetchAuth<UacsObjectRecord[]>(token, '/reference/uacs-objects/all');
}

export function apiCreateUacsObject(
  token: string,
  payload: { code: string; description: string; expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO' },
) {
  return apiFetchAuth<UacsObjectRecord>(token, '/reference/uacs-objects', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdateUacsObject(
  token: string,
  id: string,
  payload: {
    description?: string;
    expenseClass?: 'PS' | 'MOOE' | 'FE' | 'CO';
    isActive?: boolean;
  },
) {
  return apiFetchAuth<UacsObjectRecord>(token, `/reference/uacs-objects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeactivateUacsObject(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/uacs-objects/${id}`,
    { method: 'DELETE' },
  );
}

export interface ClimateTypologyCodeRecord {
  id: string;
  code: string;
  pillar: 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING';
  name: string;
  description: string | null;
  isActive: boolean;
}

export function apiGetClimateTypologyCodesAll(token: string) {
  return apiFetchAuth<ClimateTypologyCodeRecord[]>(
    token,
    '/reference/climate-typology-codes/all',
  );
}

export function apiCreateClimateTypologyCode(
  token: string,
  payload: {
    code: string;
    pillar: 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING';
    name: string;
    description?: string;
  },
) {
  return apiFetchAuth<ClimateTypologyCodeRecord>(
    token,
    '/reference/climate-typology-codes',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function apiUpdateClimateTypologyCode(
  token: string,
  id: string,
  payload: {
    pillar?: 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING';
    name?: string;
    description?: string;
    isActive?: boolean;
  },
) {
  return apiFetchAuth<ClimateTypologyCodeRecord>(
    token,
    `/reference/climate-typology-codes/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function apiDeactivateClimateTypologyCode(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/climate-typology-codes/${id}`,
    { method: 'DELETE' },
  );
}

export interface SglgIndicatorRecord {
  id: string;
  pillar: string;
  code: string;
  name: string;
  dilgYear: number;
  isActive: boolean;
}

export function apiGetSglgIndicators(token: string) {
  return apiFetchAuth<SglgIndicatorRecord[]>(token, '/reference/sglg-indicators');
}

export function apiGetSglgIndicatorsAll(token: string) {
  return apiFetchAuth<SglgIndicatorRecord[]>(
    token,
    '/reference/sglg-indicators/all',
  );
}

export function apiCreateSglgIndicator(
  token: string,
  payload: { pillar: string; code: string; name: string; dilgYear: number },
) {
  return apiFetchAuth<SglgIndicatorRecord>(token, '/reference/sglg-indicators', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdateSglgIndicator(
  token: string,
  id: string,
  payload: { pillar?: string; name?: string; dilgYear?: number; isActive?: boolean },
) {
  return apiFetchAuth<SglgIndicatorRecord>(
    token,
    `/reference/sglg-indicators/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function apiDeactivateSglgIndicator(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/sglg-indicators/${id}`,
    { method: 'DELETE' },
  );
}

export interface SdgGoalRecord {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export function apiGetSdgGoals(token: string) {
  return apiFetchAuth<SdgGoalRecord[]>(token, '/reference/sdg-goals');
}

export function apiGetSdgGoalsAll(token: string) {
  return apiFetchAuth<SdgGoalRecord[]>(token, '/reference/sdg-goals/all');
}

export function apiCreateSdgGoal(
  token: string,
  payload: { code: string; name: string },
) {
  return apiFetchAuth<SdgGoalRecord>(token, '/reference/sdg-goals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdateSdgGoal(
  token: string,
  id: string,
  payload: { name?: string; isActive?: boolean },
) {
  return apiFetchAuth<SdgGoalRecord>(token, `/reference/sdg-goals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeactivateSdgGoal(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/sdg-goals/${id}`,
    { method: 'DELETE' },
  );
}

export interface CsoRecord {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  canEndorse: boolean;
  clusterId: string;
  cluster: { id: string; name: string; fullName: string | null };
}

export function apiGetCivilSocietyOrganizations(token: string) {
  return apiFetchAuth<CsoRecord[]>(
    token,
    '/reference/civil-society-organizations',
  );
}

export function apiGetCsosAll(token: string) {
  return apiFetchAuth<CsoRecord[]>(
    token,
    '/reference/civil-society-organizations/all',
  );
}

export function apiCreateCso(
  token: string,
  payload: { name: string; code?: string; clusterId: string; canEndorse?: boolean },
) {
  return apiFetchAuth<CsoRecord>(
    token,
    '/reference/civil-society-organizations',
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export function apiUpdateCso(
  token: string,
  id: string,
  payload: {
    name?: string;
    code?: string;
    clusterId?: string;
    canEndorse?: boolean;
    isActive?: boolean;
  },
) {
  return apiFetchAuth<CsoRecord>(
    token,
    `/reference/civil-society-organizations/${id}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function apiDeactivateCso(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/reference/civil-society-organizations/${id}`,
    { method: 'DELETE' },
  );
}

// ─── AIP cycles ──────────────────────────────────────────────────────────────

/** LOCKED is the pre-specs/012 name for ADOPTED; both mean the AIP is final. */
export type AipCycleStatus = 'PLANNING' | 'OPEN' | 'CLOSED' | 'LOCKED' | 'ADOPTED';

export interface AipCycleRecord {
  id: string;
  fiscalYear: number;
  status: AipCycleStatus;
  _count: { ceilings: number; programs: number };
}

export interface AipCycleDetailRecord {
  id: string;
  fiscalYear: number;
  status: AipCycleStatus;
  publicComparisonEnabled: boolean;
  publicAipOverviewEnabled: boolean;
  publicAnnualOverviewEnabled: boolean;
  publicPpmpOverviewEnabled: boolean;
  /** Whether this year's published budget is open data (specs/007). */
  openDataEnabled: boolean;
  /** Public sections the year is in — computed by the API, never re-derived here. */
  sections: ('aip' | 'annual')[];
  /** The Budget Cycle this AIP is the AIP stage of (specs/012). */
  budgetCycle: { id: string; currentStage: number; alongsideStages: number[] };
  ceilings: FinishLineCeilingRecord[];
  _count: { programs: number };
}

export function apiGetAipCycles(token: string) {
  return apiFetchAuth<AipCycleRecord[]>(token, '/aip-cycles');
}

export function apiGetAipCycle(token: string, id: string) {
  return apiFetchAuth<AipCycleDetailRecord>(token, `/aip-cycles/${id}`);
}

export function apiCreateAipCycle(token: string, payload: { fiscalYear: number }) {
  return apiFetchAuth<AipCycleRecord>(token, '/aip-cycles', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdateAipCycleStatus(token: string, id: string, status: AipCycleStatus) {
  return apiFetchAuth<AipCycleDetailRecord>(token, `/aip-cycles/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function apiSetAipCyclePublicComparison(
  token: string,
  id: string,
  enabled: boolean,
) {
  return apiFetchAuth<AipCycleDetailRecord>(
    token,
    `/aip-cycles/${id}/public-comparison`,
    { method: 'PATCH', body: JSON.stringify({ enabled }) },
  );
}

export function apiSetAipCycleOpenData(
  token: string,
  id: string,
  enabled: boolean,
) {
  return apiFetchAuth<AipCycleDetailRecord>(token, `/aip-cycles/${id}/open-data`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  });
}

export type PublicOverviewSection = 'AIP' | 'ANNUAL' | 'PPMP';

/** Set a Budget Cycle's stage (specs/012). 409 when the stage needs an enacted budget. */
export function apiSetBudgetCycleStage(
  token: string,
  budgetCycleId: string,
  body: { currentStage: number; alongsideStages: number[] },
) {
  return apiFetchAuth<{ id: string; currentStage: number; alongsideStages: number[] }>(
    token,
    `/budget-cycles/${budgetCycleId}/stage`,
    { method: 'PATCH', body: JSON.stringify(body) },
  );
}

// ─── Budget documents (specs/012) ────────────────────────────────────────────

export type BudgetDocumentKind = 'LEP' | 'ORDINANCE';
export type BudgetDocumentStatus = 'DRAFT' | 'SUBMITTED' | 'ENACTED';

/** An LEP or Ordinance, as `GET /budget-documents` lists it. */
export interface BudgetDocumentRecord {
  id: string;
  budgetCycleId: string;
  kind: BudgetDocumentKind;
  status: BudgetDocumentStatus;
  sourceDocumentName: string | null;
  finalizedAt: string | null;
  budgetCycle: { fiscalYear: number };
  ordinanceDetail: {
    ordinanceNumber: string | null;
    passedAt: string | null;
    approvedAt: string | null;
  } | null;
  lepDetail?: { submittedAt: string | null; allocableTotal: string | null } | null;
  _count: { items: number; objectLines: number };
}

/** An office's header block as one book prints it (LBP Form 4; specs/017). */
export interface BudgetOfficeHeaderRecord {
  officeId: string;
  mandateLegalBasis: string | null;
  vision: string | null;
  mission: string | null;
  organizationalOutcomes: string[];
  source: SourceLink | null;
}

export interface BudgetDocumentDetail extends BudgetDocumentRecord {
  officeHeaders: BudgetOfficeHeaderRecord[];
  /** Σ of the top-level PPAs' totals. */
  total: string;
  flaggedItemCount: number;
  /** An LEP's total minus its allocable total (positive = over); null without one. */
  overAllocable: string | null;
}

/** One PPA. Money is its own; `total` = own + every PPA under it. */
export interface BudgetItemRecord {
  id: string;
  parentId: string | null;
  rootItemId: string;
  officeId: string;
  hostOfficeId: string | null;
  papClass: string | null;
  aipReferenceCode: string | null;
  name: string;
  majorFinalOutput: string | null;
  performanceIndicator: string | null;
  target: string | null;
  ps: string;
  mooe: string;
  fe: string;
  co: string;
  unsplit: string;
  total: string;
  fundSource: string | null;
  orderIndex: number;
  importWarnings: string[];
  office: { id: string; acronym: string; name: string };
  /** Where the import read it: file, page (when it has pages), table/sheet and row. */
  source?: SourceLink | null;
}

export interface BudgetObjectLineRecord {
  id: string;
  officeId: string;
  uacsCode: string;
  accountTitle: string | null;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  fundSource: string | null;
  amount: string;
  office: { id: string; acronym: string; name: string };
  source?: SourceLink | null;
}

export interface BudgetDocumentAuditRecord {
  id: string;
  itemId: string | null;
  action: string;
  detail: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; firstName: string; lastName: string } | null;
}

export function apiListBudgetDocuments(token: string) {
  return apiFetchAuth<BudgetDocumentRecord[]>(token, '/budget-documents');
}

export function apiGetBudgetDocument(token: string, id: string) {
  return apiFetchAuth<BudgetDocumentDetail>(token, `/budget-documents/${id}`);
}

export function apiListBudgetItems(token: string, id: string) {
  return apiFetchAuth<BudgetItemRecord[]>(token, `/budget-documents/${id}/items`);
}

export function apiListBudgetObjectLines(token: string, id: string) {
  return apiFetchAuth<BudgetObjectLineRecord[]>(token, `/budget-documents/${id}/object-lines`);
}

/** A document's lines against the year before (specs/017 FR-010): derived, never a gate. */
export interface BudgetDocumentComparison {
  fiscalYear: number;
  previous: { id: string; kind: 'LEP' | 'ORDINANCE'; fiscalYear: number } | null;
  counts: { here: number; there: number; matched: number; equal: number; differ: number };
  rows: {
    kind: 'object' | 'receipt';
    scope: string;
    code: string;
    title: string;
    thisCurrentYear: string | null;
    previousBudgetYear: string | null;
    delta: string | null;
  }[];
}

export function apiCompareBudgetDocument(token: string, id: string) {
  return apiFetchAuth<BudgetDocumentComparison>(token, `/budget-documents/${id}/compare-previous`);
}

export function apiGetBudgetDocumentAudit(token: string, id: string) {
  return apiFetchAuth<BudgetDocumentAuditRecord[]>(token, `/budget-documents/${id}/audit`);
}

export function apiAcknowledgeBudgetItem(token: string, id: string, itemId: string) {
  return apiFetchAuth<unknown>(token, `/budget-documents/${id}/items/${itemId}/acknowledge-import`, {
    method: 'POST',
  });
}

/** Start the year's DRAFT LEP from its adopted AIP. 409 AIP_NOT_ADOPTED / AIP_EMPTY / LEP_EXISTS. */
export function apiCarryForwardLep(token: string, aipCycleId: string, allocableTotal: string) {
  return apiFetchAuth<{ document: BudgetDocumentDetail; listed: { id: string; name: string }[] }>(
    token,
    '/budget-documents/carry-forward',
    { method: 'POST', body: JSON.stringify({ aipCycleId, allocableTotal }) },
  );
}

/** Revise a draft LEP's total allocable budget. */
export function apiSetLepAllocable(token: string, id: string, allocableTotal: string) {
  return apiFetchAuth<BudgetDocumentDetail>(token, `/budget-documents/${id}/allocable`, {
    method: 'PATCH',
    body: JSON.stringify({ allocableTotal }),
  });
}

/** An LEP becomes SUBMITTED, an Ordinance ENACTED. 409 while a PPA still needs review. */
export function apiFinalizeBudgetDocument(token: string, id: string) {
  return apiFetchAuth<unknown>(token, `/budget-documents/${id}/finalize`, { method: 'POST' });
}

export function apiSetAipCyclePublicOverview(
  token: string,
  id: string,
  section: PublicOverviewSection,
  enabled: boolean,
) {
  return apiFetchAuth<AipCycleDetailRecord>(
    token,
    `/aip-cycles/${id}/public-overview`,
    { method: 'PATCH', body: JSON.stringify({ section, enabled }) },
  );
}

export interface EndorsementBlocker {
  id: string;
  name: string;
  status: string;
}

export type SubmitForApprovalResult =
  | { ok: true; submitted: number }
  | { ok: false; type: 'BLOCKERS'; message: string; blockers: EndorsementBlocker[] }
  | { ok: false; type: 'EMPTY'; message: string };

export async function apiSubmitForApproval(
  token: string,
  cycleId: string,
): Promise<SubmitForApprovalResult> {
  const res = await fetch(`${API_URL}/aip-cycles/${cycleId}/submit-for-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.ok) {
    const data = (await res.json()) as { submitted: number };
    return { ok: true, submitted: data.submitted };
  }

  const body = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    statusCode?: number;
    blockers?: EndorsementBlocker[];
  };

  if (res.status === 422) {
    const message = Array.isArray(body.message)
      ? body.message.join('; ')
      : (body.message ?? 'Unprocessable');
    if (body.blockers && body.blockers.length > 0) {
      return { ok: false, type: 'BLOCKERS', message, blockers: body.blockers };
    }
    return { ok: false, type: 'EMPTY', message };
  }

  const raw = body.message;
  const message = Array.isArray(raw)
    ? raw.slice(0, 2).join('; ') + (raw.length > 2 ? ` and ${raw.length - 2} more` : '')
    : (raw ?? res.statusText);
  const err = new Error(message) as Error & { statusCode: number };
  err.statusCode = body.statusCode ?? res.status;
  throw err;
}

export interface CreateFinishLineCeilingPayload {
  aipCycleId: string;
  finishLineId: string;
  totalCeiling: string;
}

export function apiCreateFinishLineCeiling(token: string, payload: CreateFinishLineCeilingPayload) {
  return apiFetchAuth<FinishLineCeilingRecord>(token, '/finish-line-ceilings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface UpdateFinishLineCeilingPayload {
  totalCeiling?: string;
}

export function apiUpdateFinishLineCeiling(
  token: string,
  id: string,
  payload: UpdateFinishLineCeilingPayload,
) {
  return apiFetchAuth<FinishLineCeilingRecord>(token, `/finish-line-ceilings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

// ─── Programs ────────────────────────────────────────────────────────────────

export type ProgramStatus =
  | 'DRAFT'
  | 'FOR_REVISION'
  | 'SUBMITTED'
  | 'HEAD_REVIEWED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED';

export interface ProgramListItem {
  id: string;
  name: string;
  status: ProgramStatus;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  finishLineId: string;
  subFinishLineId: string | null;
  officeId: string | null;
  /** Set when the program prints under another office's AB sheet. */
  hostOfficeId?: string | null;
  civilSocietyOrganizationId: string | null;
  /** Null on programs created before the field existed — treated as Operations. */
  papClass: PapClass | null;
  papSectorId: string;
  papSector: { id: string; code: string; name: string } | null;
  orderIndex: number;
  grandTotal: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  /**
   * Phase 1 D17: the line-item family above is structurally 0 while line-item
   * entry is deferred, so the UI reads this proposed family instead.
   */
  proposedTotal: string | null;
  psProposedTotal: string | null;
  mooeProposedTotal: string | null;
  feProposedTotal: string | null;
  coProposedTotal: string | null;
  createdAt: string;
  updatedAt: string;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  expectedOutput: string;
  finishLine: { id: string; name: string; visionNumber: number | null };
  subFinishLine: { id: string; code: string; name: string } | null;
  office: { id: string; acronym: string; name: string; clusterId: string } | null;
  /** Set only on component programs — the office whose AB sheet this prints under. */
  hostOffice?: { id: string; acronym: string; name: string } | null;
  civilSocietyOrganization: { id: string; name: string; clusterId: string } | null;
  supportingOffices?: Array<{ id: string; name: string; acronym?: string }>;
}

export interface ProgramListResponse {
  total: number;
  page: number;
  pageSize: number;
  items: ProgramListItem[];
}

export interface ListProgramsParams {
  cycleId?: string;
  status?: ProgramStatus;
  clusterId?: string;
  finishLineId?: string;
  officeId?: string;
  csoId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function apiGetPrograms(token: string, params?: ListProgramsParams) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) qs.set(k, String(v));
    }
  }
  const q = qs.toString();
  return apiFetchAuth<ProgramListResponse>(token, `/programs${q ? `?${q}` : ''}`);
}

export interface PreviewAipCodePayload {
  aipCycleId: string;
  papSectorId: string;
  officeId?: string;
  /**
   * AIP form section. It is segment 5 of the code *and* the bucket the ordinal
   * restarts in, so omitting it does not just blank a segment — the preview
   * emits `003` (Operations, the null fall-through) and counts the wrong
   * siblings. Send it whenever the form has one.
   */
  papClass?: PapClass;
}

export interface AipCodePreview {
  code: string;
  counter: number;
}

export interface PreviewPaAipCodePayload {
  programId: string;
  /** Omit for a root project/activity; set when nesting under a project. */
  parentProjectActivityId?: string;
}

export function apiPreviewPaAipCode(
  token: string,
  payload: PreviewPaAipCodePayload,
) {
  return apiFetchAuth<AipCodePreview>(token, '/aip-codes/preview-pa', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiPreviewAipCode(token: string, payload: PreviewAipCodePayload) {
  return apiFetchAuth<AipCodePreview>(token, '/aip-codes/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface CreateProgramPayload {
  aipCycleId: string;
  officeId: string;
  /**
   * The office whose printed AB sheet this program appears under, in that
   * sheet's COMPONENT PROGRAMS band. Omit for the ordinary case — the code
   * still names `officeId` either way.
   */
  hostOfficeId?: string;
  papSectorId: string;
  /** AIP form section — decides the GAS / STO / Operations heading in the export. */
  papClass: PapClass;
  finishLineId: string;
  subFinishLineId?: string;
  sglgIndicatorId?: string;
  name: string;
  description?: string;
  remarks?: string;
  /** Optional — the MFO is often not settled when a program is first drafted. */
  expectedOutput?: string;
  /** Target for the Budget Year — printed on LBP Form 4. */
  targetForBudgetYear?: string;
  implementationStartMonth: number;
  implementationStartYear: number;
  implementationEndMonth: number;
  implementationEndYear: number;
  supportingOfficeIds?: string[];
  sdgGoalIds?: string[];
  /** Optional programme-level costs. Sent only when the office states them. */
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  fundSources?: string[];
  psProposedTotal?: string | null;
  mooeProposedTotal?: string | null;
  feProposedTotal?: string | null;
  coProposedTotal?: string | null;
  /** The own costs split by fund; `[]` returns the program to one total. */
  fundAllocations?: FundAllocationRecord[];
}

export interface UpdateProgramPayload {
  /** Implementing office. Reassigning it re-issues the tentative AIP code. */
  officeId?: string;
  /** Host office for a component program; `null` makes it ordinary again. */
  hostOfficeId?: string | null;
  papSectorId?: string;
  papClass?: PapClass;
  papSubsectorCode?: string;
  finishLineId?: string;
  subFinishLineId?: string | null;
  sglgIndicatorId?: string | null;
  name?: string;
  description?: string | null;
  remarks?: string | null;
  expectedOutput?: string;
  targetForBudgetYear?: string | null;
  implementationStartMonth?: number;
  implementationStartYear?: number;
  implementationEndMonth?: number;
  implementationEndYear?: number;
  supportingOfficeIds?: string[];
  /** Replaces the current SDG goal set. */
  sdgGoalIds?: string[];
  /** Optional programme-level costs. Sent only when the office states them. */
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  fundSources?: string[];
  psProposedTotal?: string | null;
  mooeProposedTotal?: string | null;
  feProposedTotal?: string | null;
  coProposedTotal?: string | null;
  /** The own costs split by fund; `[]` returns the program to one total. */
  fundAllocations?: FundAllocationRecord[];
}

export interface ProgramRecord {
  id: string;
  name: string;
  status: string;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
}

export function apiCreateProgram(token: string, payload: CreateProgramPayload) {
  return apiFetchAuth<ProgramRecord>(token, '/programs', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// ─── Program detail ───────────────────────────────────────────────────────────

export interface ProgramDetailRecord {
  id: string;
  climateChangeTag?: ClimateTagRecord | null;
  thematicTags?: ThematicTagRef[];
  name: string;
  status: string;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  officeId: string | null;
  civilSocietyOrganizationId: string | null;
  /** Set when the program prints under another office's AB sheet. */
  hostOfficeId?: string | null;
  papSectorId: string;
  /** Null on programs created before the field existed. */
  papClass: PapClass | null;
  finishLineId: string;
  subFinishLineId: string | null;
  sglgIndicatorId: string | null;
  description: string | null;
  remarks: string | null;
  expectedOutput: string;
  grandTotal: string;
  /**
   * Phase 1 D17: the line-item family (`grandTotal`) is structurally 0 while
   * line-item entry is deferred, so read the proposed family instead.
   */
  proposedTotal: string | null;
  psProposedTotal: string | null;
  mooeProposedTotal: string | null;
  feProposedTotal: string | null;
  coProposedTotal: string | null;
  /** Phase 1: the version the public is served, and the publish metadata. */
  currentVersion?: number;
  publishedVersionId?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  finishLine: { id: string; name: string; visionNumber: number | null };
  subFinishLine: { id: string; code: string; name: string } | null;
  papSector: { id: string; code: string; name: string };
  sglgIndicator: { id: string; code: string; name: string; pillar: string } | null;
  office:
    | {
        id: string;
        acronym: string;
        name: string;
        cluster?: { id: string; name: string } | null;
      }
    | null;
  civilSocietyOrganization:
    | {
        id: string;
        name: string;
        cluster?: { id: string; name: string } | null;
      }
    | null;
  aipCycle: { id: string; fiscalYear: number; status: string };
  supportingOffices: Array<{
    office: { id: string; acronym: string; name: string };
  }>;
  sdgGoals: Array<{ sdgGoal: { id: string; code: string; name: string } }>;
  projectActivities: Array<{
    id: string;
    type: 'PROJECT' | 'ACTIVITY';
    name: string;
    parentProjectActivityId: string | null;
    tentativeAipReferenceCode: string;
    aipReferenceCode: string | null;
    orderIndex: number;
    grandTotal: string;
    /** Phase 1 D17 — see the program's proposed family above. */
    proposedBudget: string | null;
    fundSources: FundSource[];
    psEstimate: string | null;
    mooeEstimate: string | null;
    feEstimate: string | null;
    coEstimate: string | null;
  }>;
}

export function apiGetProgram(token: string, id: string) {
  return apiFetchAuth<ProgramDetailRecord>(token, `/programs/${id}`);
}

export function apiUpdateProgram(
  token: string,
  id: string,
  payload: UpdateProgramPayload,
) {
  return apiFetchAuth<ProgramDetailRecord>(token, `/programs/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeleteProgram(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(token, `/programs/${id}`, {
    method: 'DELETE',
  });
}


// ─── Publish lifecycle (Phase 1 §3.2-3.4) ────────────────────────────────────

export type PublishBlocker =
  | 'NO_PPAS'
  | 'ZERO_PROPOSED_BUDGET'
  | 'ALREADY_PUBLISHED'
  | 'NOT_PUBLISHABLE_STATUS'
  | 'INCOMPLETE_IMPORT'
  | 'INCOMPLETE_DATA'
  | 'EMPTY_PARENT_PPA';

export interface PublishReadiness {
  programId: string;
  name: string;
  officeId: string | null;
  paCount: number;
  proposedTotal: string;
  ready: boolean;
  blockers: PublishBlocker[];
  /**
   * The import's own reasons this program needs a look, verbatim. Empty on
   * anything authored in the portal.
   */
  importWarnings: string[];
  /** Advisory only — ceilings never block publication in Phase 1 (D18). */
  warnings: string[];
  /** Surfaced beside the publish button as information, not a gate. */
  unresolvedComments: number;
}

export interface ProgramFieldDiff {
  [field: string]: { from: unknown; to: unknown };
}

export interface ProgramDraftDiff {
  hasChanges: boolean;
  programChanges: ProgramFieldDiff | null;
  paChanges: {
    paId: string;
    name: string;
    status: 'added' | 'removed' | 'changed';
    fields: ProgramFieldDiff | null;
  }[];
  publishedTotal: string | null;
  draftTotal: string;
}

/** PUBLISHED → PUBLISHED_REVISION. Explicit, permissioned, and logged. */
export function apiReviseProgram(token: string, id: string) {
  return apiFetchAuth<{ id: string; status: string }>(
    token,
    `/programs/${id}/revise`,
    { method: 'POST' },
  );
}

export function apiPublishProgram(token: string, id: string) {
  return apiFetchAuth<{ version: number; aipReferenceCode: string }>(
    token,
    `/programs/${id}/publish`,
    { method: 'POST' },
  );
}

/** specs/013 — SUPER_ADMIN only; both require a reason. */
export function apiArchiveProgram(token: string, id: string, reason: string) {
  return apiFetchAuth<{ id: string; status: string }>(
    token,
    `/programs/${id}/archive`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function apiUnarchiveProgram(
  token: string,
  id: string,
  reason: string,
) {
  return apiFetchAuth<{ id: string; status: string }>(
    token,
    `/programs/${id}/unarchive`,
    { method: 'POST', body: JSON.stringify({ reason }) },
  );
}

export function apiDiscardProgramDraft(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/programs/${id}/discard-draft`,
    { method: 'POST' },
  );
}

/**
 * Confirms the decisions the 2027 import made on a program's behalf, clearing
 * `importWarnings` and the INCOMPLETE_IMPORT blocker. Data gaps are not cleared
 * here — those are derived server-side and clear when the data is fixed.
 */
export function apiAcknowledgeProgramImport(token: string, id: string) {
  return apiFetchAuth<{ id: string; importWarnings: string[] }>(
    token,
    `/programs/${id}/acknowledge-import`,
    { method: 'POST' },
  );
}

export function apiGetPublishReadiness(token: string, id: string) {
  return apiFetchAuth<PublishReadiness>(
    token,
    `/programs/${id}/publish-readiness`,
  );
}

export function apiGetProgramDraftDiff(token: string, id: string) {
  return apiFetchAuth<ProgramDraftDiff>(token, `/programs/${id}/draft-diff`);
}

export interface ClusterPublishResult {
  published: { programId: string; version: number; code: string }[];
  /** Not failures — a blocked program is left alone for the encoder to fix. */
  skipped: { programId: string; reason: PublishBlocker }[];
  failed: { programId: string; error: string }[];
}

export function apiPublishCluster(
  token: string,
  aipCycleId: string,
  clusterIds: string[],
) {
  return apiFetchAuth<ClusterPublishResult>(
    token,
    `/aip-cycles/${aipCycleId}/publish`,
    { method: 'POST', body: JSON.stringify({ clusterIds }) },
  );
}

export interface AcknowledgeImportsResult {
  total: number;
  acknowledged: number;
  failed: { programId: string; error: string }[];
}

/**
 * Confirm the import decisions on every flagged program in a cluster.
 *
 * Bulk because an imported book needs it: every program in the enacted 2026
 * budget carries an inferred finish line, so publishing would skip all of them
 * until each is confirmed.
 */
export function apiAcknowledgeImports(
  token: string,
  aipCycleId: string,
  clusterIds: string[],
) {
  return apiFetchAuth<AcknowledgeImportsResult>(
    token,
    `/aip-cycles/${aipCycleId}/acknowledge-imports`,
    { method: 'POST', body: JSON.stringify({ clusterIds }) },
  );
}

/** Dry run of the same preconditions the publish button applies. */
/** Unpublished entry count per cluster, keyed by cluster id. */
export function apiPublishableCounts(token: string, aipCycleId: string) {
  return apiFetchAuth<Record<string, number>>(
    token,
    `/aip-cycles/${aipCycleId}/publishable-counts`,
  );
}

export function apiPublishPreview(
  token: string,
  aipCycleId: string,
  clusterIds: string[],
) {
  return apiFetchAuth<PublishReadiness[]>(
    token,
    `/aip-cycles/${aipCycleId}/publish-preview`,
    { method: 'POST', body: JSON.stringify({ clusterIds }) },
  );
}

// ─── Edit history (Phase 1 §3.6) ─────────────────────────────────────────────

export interface EditHistoryEntry {
  id: string;
  action: string;
  targetType: 'PROGRAM' | 'PROJECT_ACTIVITY' | 'COMMENT' | 'LINE_ITEM';
  targetId: string | null;
  /** Written at log time, so rendering never depends on re-resolving deleted rows. */
  summary: string;
  changes: ProgramFieldDiff | null;
  createdAt: string;
  actor: { id: string; name: string; role: string };
  /** The office acted FOR — the proponent, not the actor's home office. */
  onBehalfOf: { id: string; acronym: string; name: string } | null;
  version: number | null;
  /** The program the event belongs to — what the cross-program feed labels each row with. */
  program?: {
    id: string;
    name: string;
    code: string;
    office: { id: string; acronym: string } | null;
  };
}

export interface EditHistoryPage {
  items: EditHistoryEntry[];
  nextCursor: string | null;
}

export function apiGetProgramEditHistory(
  token: string,
  programId: string,
  params?: { action?: string; actorUserId?: string; cursor?: string; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.action) qs.set('action', params.action);
  if (params?.actorUserId) qs.set('actorUserId', params.actorUserId);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchAuth<EditHistoryPage>(
    token,
    `/programs/${programId}/edit-history${suffix}`,
  );
}

/** Every program the caller can audit (`GET /admin/edit-history`), bounded by office scope. */
export function apiGetAllEditHistory(
  token: string,
  params?: { officeId?: string; action?: string; cursor?: string; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.officeId) qs.set('officeId', params.officeId);
  if (params?.action) qs.set('action', params.action);
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchAuth<EditHistoryPage>(token, `/admin/edit-history${suffix}`);
}

export function apiGetProjectActivityEditHistory(
  token: string,
  paId: string,
  params?: { cursor?: string; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.cursor) qs.set('cursor', params.cursor);
  if (params?.limit) qs.set('limit', String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchAuth<EditHistoryPage>(
    token,
    `/project-activities/${paId}/edit-history${suffix}`,
  );
}

// ─── Comments & Activity Stream ───────────────────────────────────────────────

export type CommentStage = 'SECTOR_FEEDBACK' | 'HEAD_REVIEW' | 'ENDORSEMENT' | 'APPROVAL' | 'GENERAL' | 'PUBLIC_FEEDBACK';
export type CommentTarget = 'PROGRAM' | 'PROJECT_ACTIVITY' | 'LINE_ITEM';

/** Display identity for a comment author or resolver (name / office / role). */
export interface CommentActor {
  id: string;
  name: string;
  role: string;
  office: string | null;
}

export interface ProgramComment {
  id: string;
  programId: string;
  programVersionId: string | null;
  authorUserId: string;
  stage: CommentStage | null;
  targetType: CommentTarget | null;
  targetId: string | null;
  parentCommentId: string | null;
  content: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolveNote: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on activity-stream / comment-list responses. */
  author?: CommentActor | null;
  resolvedBy?: CommentActor | null;
  /** Present on root comments in the activity stream (threaded). */
  replies?: ProgramComment[];
}

export interface CreateCommentPayload {
  content: string;
  parentCommentId?: string;
  targetType?: CommentTarget;
  targetId?: string;
  programVersionId?: string;
}

export function apiGetComments(token: string, programId: string, opts?: { targetId?: string }) {
  const q = opts?.targetId ? `?targetId=${encodeURIComponent(opts.targetId)}` : '';
  return apiFetchAuth<ProgramComment[]>(token, `/programs/${programId}/comments${q}`);
}

export function apiPostComment(token: string, programId: string, payload: CreateCommentPayload) {
  return apiFetchAuth<ProgramComment>(token, `/programs/${programId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiGetCommentPermission(token: string, programId: string) {
  return apiFetchAuth<{ canComment: boolean }>(
    token,
    `/programs/${programId}/comments/permission`,
  );
}

export function apiDeleteComment(token: string, commentId: string) {
  return apiFetchAuth<{ message: string }>(token, `/comments/${commentId}`, {
    method: 'DELETE',
  });
}

export function apiRestoreComment(token: string, commentId: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/comments/${commentId}/restore`,
    { method: 'PATCH' },
  );
}

/**
 * `note` is metadata stamped on the thread; `reply` is posted as a real, visible
 * child comment attributed to the resolver (Phase 1 D10). Independent — either,
 * both, or neither.
 */
export function apiResolveComment(
  token: string,
  commentId: string,
  note?: string,
  reply?: string,
) {
  return apiFetchAuth<ProgramComment>(token, `/comments/${commentId}/resolve`, {
    method: 'PATCH',
    body: JSON.stringify({
      note: note ?? null,
      ...(reply ? { reply } : {}),
    }),
  });
}

export function apiUnresolveComment(token: string, commentId: string) {
  return apiFetchAuth<ProgramComment>(
    token,
    `/comments/${commentId}/unresolve`,
    { method: 'PATCH' },
  );
}

export type ActivityEventKind = 'comment' | 'endorsement' | 'verdict';

export interface ActivityEvent {
  kind: ActivityEventKind;
  at: string;
  payload: Record<string, unknown>;
}

export function apiGetActivityStream(token: string, programId: string) {
  return apiFetchAuth<ActivityEvent[]>(token, `/programs/${programId}/activity-stream`);
}

export function apiGetProjectActivityStream(token: string, paId: string) {
  return apiFetchAuth<ActivityEvent[]>(token, `/project-activities/${paId}/activity-stream`);
}

// ─── Endorsements ──────────────────────────────────────────────────────────────

export type EndorserType = 'LGU' | 'NCPC';

// Endorsements are affirmative-only (OD-2): a row's existence is the concurrence.
export interface ProgramEndorsementRecord {
  id: string;
  endorsedAt: string | null;
  endorsedByUserId: string | null;
  notes: string | null;
  // Polymorphic endorser (NCPC endorser pivot §3.3): an LGU city office, a CSO
  // representative, or — both relations null on an NCPC row — the NCPC umbrella
  // head.
  endorserType: EndorserType;
  endorserOffice: { id: string; name: string; acronym: string } | null;
  endorserCso: { id: string; name: string; code: string | null } | null;
}

/** Display label for a polymorphic endorser row (§3.3). */
export function endorserLabel(e: {
  endorserType: EndorserType;
  endorserOffice: { name: string; acronym: string } | null;
  endorserCso: { name: string; code: string | null } | null;
}): string {
  if (e.endorserType === 'LGU') {
    return e.endorserOffice?.acronym ?? e.endorserOffice?.name ?? 'LGU office';
  }
  if (e.endorserCso) return `NCPC — ${e.endorserCso.name}`;
  return 'NCPC (umbrella head)';
}

export function apiGetProgramEndorsements(token: string, programId: string) {
  return apiFetchAuth<{ version: number; endorsements: ProgramEndorsementRecord[] }>(
    token,
    `/programs/${programId}/endorsements`,
  );
}

// ─── LFC Committee Approval ─────────────────────────────────────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'RETURNED' | 'REJECTED';

export interface ProgramApprovalRecord {
  id: string;
  status: ApprovalStatus;
  decidedAt: string | null;
  decidedByUserId: string | null;
  notes: string | null;
  office: { id: string; name: string; acronym: string };
  committee: { id: string; code: string; name: string };
}

export function apiGetProgramApprovals(token: string, programId: string) {
  return apiFetchAuth<{ version: number; approvals: ProgramApprovalRecord[] }>(
    token,
    `/programs/${programId}/approvals`,
  );
}

// ─── Read state ───────────────────────────────────────────────────────────────

export function apiMarkProgramSeen(token: string, programId: string) {
  return apiFetchAuth<{ lastSeenAt: string }>(
    token,
    `/programs/${programId}/mark-seen`,
    { method: 'POST' },
  );
}

// ─── Real-time events (SSE) ───────────────────────────────────────────────────

export function apiGetEventsTicket(token: string) {
  return apiFetchAuth<{ ticket: string }>(token, '/events/ticket', {
    method: 'POST',
  });
}

/** Absolute base for the SSE EventSource (cannot send Authorization headers). */
export function eventsStreamUrl(ticket: string) {
  return `${API_URL}/events?ticket=${encodeURIComponent(ticket)}`;
}

// ─── AIP registry (tabbed feed) ───────────────────────────────────────────────

/**
 * Phase 1 D16: a flat status partition. The old workflow tabs were built around
 * the gate chain, which is dormant this phase.
 */
export type RegistryTab =
  | 'ALL'
  | 'DRAFTS'
  | 'REVISIONS'
  | 'PUBLISHED'
  | 'ARCHIVED';

/** The city file and row an imported program or PPA came from, as a link. */
export interface SourceLink {
  /** The city's file name. */
  file: string;
  /** Where in it: `ECON!r305` (sheet and row) or `table 2 row 11`. */
  ref: string;
  /** The page of the file, when it has pages (a PDF). */
  page?: number | null;
  /** The sheet at that row, or the file; null when nobody hosts it. */
  url: string | null;
}

/** A project/activity row embedded in a registry item — carries denormalized rollups. */
export interface RegistryProjectActivity {
  id: string;
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
  parentProjectActivityId: string | null;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  orderIndex: number;
  expectedOutput: string;
  costMode: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  grandTotal: string;
  proposedBudget: string | null;
  /** Phase 1 D17 — see ProgramListItem's proposed family. */
  psEstimate: string | null;
  mooeEstimate: string | null;
  feEstimate: string | null;
  coEstimate: string | null;
  /** Null for rows authored in the portal. */
  source: SourceLink | null;
  /** Effective tags — own direct applications plus any inherited from the parent Program. */
  thematicTags: RegistryThematicTagRef[];
}

export interface RegistryItem extends ProgramListItem {
  lastActivityAt: string;
  hasUnread: boolean;
  /** Set while ARCHIVED (specs/013): why it was superseded. */
  archivedReason?: string | null;
  archivedAt?: string | null;
  /**
   * Why a bulk-imported program still needs review, in the importer's own words.
   * Non-empty blocks publishing (`INCOMPLETE_IMPORT`); always empty on programs
   * authored in the portal.
   */
  importWarnings?: string[];
  /**
   * Gaps in the row's own data, derived server-side on every read — the same
   * sentences the publish panel shows as advisory `warnings`. Block nothing by
   * themselves and clear the moment the field is filled in.
   */
  dataWarnings?: string[];
  /** Non-null once published; what the public is served (D13). */
  publishedVersionId?: string | null;
  publishedAt?: string | null;
  /** Actions logged since the revision was opened (D15) — not a field-level diff. */
  unpublishedChangeCount?: number;
  /** Null for programs authored in the portal. */
  source: SourceLink | null;
  projectActivities: RegistryProjectActivity[];
  /** A program row's own directly-applied tags — never inherited. */
  thematicTags: RegistryThematicTagRef[];
}

export interface RegistryResponse {
  tab: RegistryTab;
  total: number;
  page: number;
  pageSize: number;
  tabCounts: Record<RegistryTab, number>;
  items: RegistryItem[];
  aggregateTotals: { ps: string; mooe: string; fe: string; co: string; total: string };
}

export interface RegistryParams {
  tab?: RegistryTab;
  cycleId?: string;
  clusterId?: string;
  finishLineIds?: string[];
  officeId?: string;
  search?: string;
  thematicTagIds?: string[];
  /** Any of these PAP classes; OPERATIONS also matches a program with none. */
  papClasses?: string[];
  /** Any of these funds, on the program or a PPA; `NONE` for neither. */
  fundSources?: string[];
  page?: number;
  pageSize?: number;
}

export function apiGetAipRegistry(token: string, params?: RegistryParams) {
  const qs = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) {
        for (const item of v) qs.append(k, String(item));
      } else {
        qs.set(k, String(v));
      }
    }
  }
  const q = qs.toString();
  return apiFetchAuth<RegistryResponse>(token, `/aip-registry${q ? `?${q}` : ''}`);
}

// ─── Program Versions ─────────────────────────────────────────────────────────

export interface ProgramVersionMeta {
  id: string;
  version: number;
  submittedAt: string;
  submittedByUserId: string;
}

export function apiGetProgramVersions(token: string, programId: string) {
  return apiFetchAuth<ProgramVersionMeta[]>(token, `/programs/${programId}/versions`);
}

export function apiCompareProgramVersions(
  token: string,
  programId: string,
  from: number,
  to: number | 'current',
) {
  return apiFetchAuth<{
    programId: string;
    from: { version: number; snapshot: Record<string, unknown> };
    to: { version: number | 'current'; snapshot?: Record<string, unknown>; live?: Record<string, unknown> };
  }>(token, `/programs/${programId}/versions/compare?from=${from}&to=${to}`);
}

// ─── Finish-line budget ceilings ─────────────────────────────────────────────

export interface FinishLineCeilingRecord {
  id: string;
  finishLineId: string;
  aipCycleId: string;
  totalCeiling: string;
  finishLine: { id: string; name: string; visionNumber: number | null };
}

export interface FinishLineCeilingHistoryRecord {
  id: string;
  ceilingId: string;
  totalCeiling: string;
  changedByUserId: string;
  changedAt: string;
  changedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

export interface FinishLineCeilingDetailRecord extends FinishLineCeilingRecord {
  aipCycle: { id: string; fiscalYear: number; status: AipCycleStatus };
  history: FinishLineCeilingHistoryRecord[];
}

export function apiGetFinishLineCeilings(token: string, cycleId?: string) {
  const qs = cycleId ? `?cycleId=${cycleId}` : '';
  return apiFetchAuth<FinishLineCeilingRecord[]>(token, `/finish-line-ceilings${qs}`);
}

export function apiGetFinishLineCeiling(token: string, id: string) {
  return apiFetchAuth<FinishLineCeilingDetailRecord>(token, `/finish-line-ceilings/${id}`);
}

// ─── Project Activities ───────────────────────────────────────────────────────

export interface CreateProjectActivityPayload {
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
  description?: string;
  remarks?: string;
  expectedOutput?: string;
  proposedBudget?: string;
  /** Funds this PPA draws on. At least one, unless `fundAllocations` names them. */
  fundSources: FundSource[];
  /** Phase 1 cost estimates (D3); proposedBudget is computed from these. */
  psEstimate?: string;
  mooeEstimate?: string;
  feEstimate?: string;
  coEstimate?: string;
  /** The costs split by fund; when sent, the estimates and funds derive from it. */
  fundAllocations?: FundAllocationRecord[];
  parentProjectActivityId?: string;
  orderIndex?: number;
  costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  implementationStartMonth?: number;
  implementationStartYear?: number;
  implementationEndMonth?: number;
  implementationEndYear?: number;
}

export interface ProjectActivityRecord {
  id: string;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
}

export interface ProjectActivityDetailRecord extends ProjectActivityRecord {
  programId: string;
  parentProjectActivityId: string | null;
  description?: string;
  remarks?: string | null;
  expectedOutput: string | null;
  proposedBudget: string | null;
  fundSources: FundSource[];
  costMode: 'DIRECT_COSTS' | 'INDIRECT_COSTS';
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  grandTotal: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  /** Phase 1 D17 — see ProgramListItem's proposed family. */
  psEstimate: string | null;
  mooeEstimate: string | null;
  feEstimate: string | null;
  coEstimate: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: Array<{
    id: string;
    expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
    uacsObjectId: string;
    quantity: string;
    unit: string;
    unitCost: string;
    remarks?: string;
    lineTotal: string;
  }>;
  climateChangeTag?: ClimateTagRecord | null;
  /** The costs split by fund; empty when declared as one total. */
  fundAllocations?: FundAllocationRecord[];
  children?: Array<{ id: string }>;
  /** Tags applied directly to this PA. */
  thematicTags?: ThematicTagRef[];
  /** The parent program's current tags, computed on read — never stored. */
  inheritedThematicTags?: ThematicTagRef[];
}

export function apiCreateProjectActivity(
  token: string,
  programId: string,
  payload: CreateProjectActivityPayload,
) {
  return apiFetchAuth<ProjectActivityRecord>(
    token,
    `/programs/${programId}/project-activities`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

export interface UpdateProjectActivityPayload {
  type?: 'PROJECT' | 'ACTIVITY';
  name?: string;
  description?: string | null;
  remarks?: string | null;
  expectedOutput?: string | null;
  proposedBudget?: string | null;
  fundSources?: FundSource[];
  psEstimate?: string | null;
  mooeEstimate?: string | null;
  feEstimate?: string | null;
  coEstimate?: string | null;
  /** `[]` returns a split row to one total. */
  fundAllocations?: FundAllocationRecord[];
  implementationStartMonth?: number | null;
  implementationStartYear?: number | null;
  implementationEndMonth?: number | null;
  implementationEndYear?: number | null;
}

export function apiUpdateProjectActivity(
  token: string,
  id: string,
  payload: UpdateProjectActivityPayload,
) {
  return apiFetchAuth<ProjectActivityRecord>(token, `/project-activities/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiGetProjectActivity(token: string, id: string) {
  return apiFetchAuth<ProjectActivityDetailRecord>(token, `/project-activities/${id}`);
}

/** What a reorder returns: the sibling group in its new order, with new codes. */
export interface ReorderedRow {
  id: string;
  orderIndex: number;
  tentativeAipReferenceCode: string;
}

/**
 * Reorder one sibling group of Projects/Activities.
 *
 * `ids` must list every sibling under `parentProjectActivityId` (null = the
 * program's root level) exactly once — a partial list is rejected. The trailing
 * AIP code segment is derived from this order, so the codes are renumbered too.
 */
export function apiReorderProjectActivities(
  token: string,
  programId: string,
  ids: string[],
  parentProjectActivityId: string | null = null,
) {
  return apiFetchAuth<ReorderedRow[]>(
    token,
    `/programs/${programId}/project-activities/reorder`,
    {
      method: 'PATCH',
      body: JSON.stringify({ ids, parentProjectActivityId }),
    },
  );
}

/**
 * Reorder programs within one AIP code scope.
 *
 * Every id must share a cycle, implementing office and PAP sector — numbering
 * restarts per scope, so a cross-scope payload is rejected rather than silently
 * reordering rows whose codes cannot follow.
 */
export function apiReorderPrograms(token: string, ids: string[]) {
  return apiFetchAuth<ReorderedRow[]>(token, '/programs/reorder', {
    method: 'PATCH',
    body: JSON.stringify({ ids }),
  });
}

export function apiDeleteProjectActivity(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(token, `/project-activities/${id}`, {
    method: 'DELETE',
  });
}

export function apiDeleteLineItem(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(token, `/line-items/${id}`, {
    method: 'DELETE',
  });
}

// ─── Line Items ───────────────────────────────────────────────────────────────

export interface CreateLineItemPayload {
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  uacsObjectId: string;
  quantity: string;
  unit: string;
  unitCost: string;
  remarks?: string;
  orderIndex?: number;
}

export function apiCreateLineItem(
  token: string,
  paId: string,
  payload: CreateLineItemPayload,
) {
  return apiFetchAuth<{ id: string }>(
    token,
    `/project-activities/${paId}/line-items`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
}

// ─── Climate Tag ─────────────────────────────────────────────────────────────

/** A climate tag on a PPA or a program: 0..n CCET codes plus amounts. */
export interface ClimateTagRecord {
  id: string;
  codes: Array<{ ccetCodeId: string; ccetCode: { id: string; code: string; name: string } }>;
  ccaAmount: string | null;
  ccmAmount: string | null;
  remarks?: string | null;
}

export interface UpsertClimateTagPayload {
  ccetCodeIds: string[];
  ccaAmount?: string;
  ccmAmount?: string;
  remarks?: string;
}

export function apiUpsertClimateTag(
  token: string,
  paId: string,
  payload: UpsertClimateTagPayload,
) {
  return apiFetchAuth<{ id: string }>(
    token,
    `/project-activities/${paId}/climate-tag`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );
}

/** The tag on a program itself — one that states its own costs, or a parent row. */
export function apiUpsertProgramClimateTag(
  token: string,
  programId: string,
  payload: UpsertClimateTagPayload,
) {
  return apiFetchAuth<ClimateTagRecord>(
    token,
    `/programs/${programId}/climate-tag`,
    { method: 'PUT', body: JSON.stringify(payload) },
  );
}

export function apiDeleteProgramClimateTag(token: string, programId: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/programs/${programId}/climate-tag`,
    { method: 'DELETE' },
  );
}

// ─── Thematic Tags ────────────────────────────────────────────────────────────

/** One catalog entry (e.g. "Youth"). */
export interface ThematicTagRef {
  id: string;
  name: string;
}

export interface ThematicTagRecord extends ThematicTagRef {
  isActive: boolean;
}

/** A tag as it appears on an AIP registry row — `inherited` only ever applies
 * to a project/activity row; a program row's own tags are never inherited. */
export interface RegistryThematicTagRef extends ThematicTagRef {
  inherited: boolean;
}

export interface ThematicTagWithUsage extends ThematicTagRecord {
  createdAt: string;
  usageCount: number;
}

/** The shape of a 409's body when a close-but-not-exact match was found (FR-007a). */
export interface CloseMatchError {
  closeMatch: ThematicTagRef;
}

/** Thrown by `apiFetch` on any non-2xx response; `.body` carries the raw JSON. */
type ApiErrorLike = Error & { statusCode?: number; body?: unknown };

/** Narrows a caught error to the `{ closeMatch }` shape `POST /thematic-tags` 409s with. */
export function closeMatchFrom(err: unknown): ThematicTagRef | null {
  const e = err as ApiErrorLike;
  if (e?.statusCode !== 409) return null;
  const body = e.body as Partial<CloseMatchError> | undefined;
  return body?.closeMatch ?? null;
}

/** Search the catalog — what the tag picker calls as the user types. */
export function apiListThematicTags(
  token: string,
  params?: { search?: string; activeOnly?: boolean },
) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.activeOnly !== undefined) qs.set('activeOnly', String(params.activeOnly));
  const q = qs.toString();
  return apiFetchAuth<ThematicTagRecord[]>(token, `/thematic-tags${q ? `?${q}` : ''}`);
}

/**
 * Find-or-create. Returns the existing row on an exact normalized match
 * (FR-007). On no exact match, throws a 409 with `{ closeMatch }` unless
 * `confirmNew` is set or nothing is close enough to flag (FR-007a) — use
 * `closeMatchFrom(err)` to read the hint out of a caught error.
 */
export function apiCreateThematicTag(
  token: string,
  payload: { name: string; confirmNew?: boolean },
) {
  return apiFetchAuth<ThematicTagRecord>(token, '/thematic-tags', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Apply a thematic tag directly to a Program (idempotent). Returns its updated direct tag list. */
export function apiApplyProgramThematicTag(token: string, programId: string, tagId: string) {
  return apiFetchAuth<ThematicTagRef[]>(token, `/programs/${programId}/thematic-tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
}

/** Remove a thematic tag directly applied to a Program (idempotent). Returns its updated direct tag list. */
export function apiRemoveProgramThematicTag(token: string, programId: string, tagId: string) {
  return apiFetchAuth<ThematicTagRef[]>(
    token,
    `/programs/${programId}/thematic-tags/${tagId}`,
    { method: 'DELETE' },
  );
}

/** Apply a thematic tag directly to a Project/Activity (idempotent). Returns its updated direct tag list. */
export function apiApplyPAThematicTag(token: string, paId: string, tagId: string) {
  return apiFetchAuth<ThematicTagRef[]>(token, `/project-activities/${paId}/thematic-tags`, {
    method: 'POST',
    body: JSON.stringify({ tagId }),
  });
}

/**
 * Remove a thematic tag directly applied to a PA. Rejected (400) if the tag
 * is only present through the parent program's inheritance (FR-009).
 */
export function apiRemovePAThematicTag(token: string, paId: string, tagId: string) {
  return apiFetchAuth<ThematicTagRef[]>(
    token,
    `/project-activities/${paId}/thematic-tags/${tagId}`,
    { method: 'DELETE' },
  );
}

/** Every tag, active and inactive, with usage counts (SUPER_ADMIN admin screen). */
export function apiListThematicTagsAll(token: string) {
  return apiFetchAuth<ThematicTagWithUsage[]>(token, '/thematic-tags/all');
}

/** Rename and/or activate/deactivate a catalog entry (SUPER_ADMIN only). */
export function apiUpdateThematicTag(
  token: string,
  id: string,
  payload: { name?: string; isActive?: boolean },
) {
  return apiFetchAuth<ThematicTagRecord>(token, `/thematic-tags/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

/** Active tags only — populates the public registry's tag filter. */
export function apiGetPublicThematicTags() {
  return apiFetch<ThematicTagRef[]>('/public/thematic-tags', undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

// ─── Reference: UACS Objects & Climate Codes ─────────────────────────────────

export interface UacsObjectRecord {
  id: string;
  code: string;
  description: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  isActive: boolean;
}

export function apiGetUacsObjects(
  token: string,
  params?: { search?: string; expenseClass?: string },
) {
  const qs = new URLSearchParams();
  if (params?.search) qs.set('search', params.search);
  if (params?.expenseClass) qs.set('expenseClass', params.expenseClass);
  const q = qs.toString();
  return apiFetchAuth<UacsObjectRecord[]>(
    token,
    `/reference/uacs-objects${q ? `?${q}` : ''}`,
  );
}

export interface ClimateCodeRecord {
  id: string;
  code: string;
  pillar: 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING';
  name: string;
  description: string | null;
  isActive: boolean;
}

export function apiGetClimateTypologyCodes(token: string) {
  return apiFetchAuth<ClimateCodeRecord[]>(token, '/reference/climate-typology-codes');
}

// ─── Endorser View ────────────────────────────────────────────────────────────

export interface EndorserOfficeRecord {
  id: string;
  name: string;
  acronym: string;
}

export interface EndorserProjectActivity {
  id: string;
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
  parentProjectActivityId: string | null;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  orderIndex: number;
  grandTotal: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
}

export interface EndorserProgram {
  id: string;
  name: string;
  status: ProgramStatus;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  grandTotal: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  finishLine: { id: string; name: string; visionNumber: number | null };
  papSector: { id: string; code: string; name: string };
  projectActivities: EndorserProjectActivity[];
}

export interface EndorserLineItem {
  id: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  uacsObjectId: string;
  uacsCode: string;
  uacsDescription: string;
  quantity: string;
  unit: string;
  unitCost: string;
  lineTotal: string;
  remarks: string | null;
  orderIndex: number;
}

export function apiGetEndorserOffices(token: string, cycleId: string) {
  return apiFetchAuth<EndorserOfficeRecord[]>(token, `/aip-cycles/${cycleId}/endorser-offices`);
}

export function apiGetEndorserPrograms(token: string, cycleId: string, officeId: string) {
  return apiFetchAuth<EndorserProgram[]>(token, `/aip-cycles/${cycleId}/offices/${officeId}/programs`);
}

export function apiGetLineItemsByPA(token: string, paId: string) {
  return apiFetchAuth<EndorserLineItem[]>(token, `/project-activities/${paId}/line-items`);
}

// ─── Public (unauthenticated) API ────────────────────────────────────────────

export interface PublicCycleRecord {
  id: string;
  fiscalYear: number;
  /** Deprecated (specs/012): equals `aipStatus`; read `sections` instead. */
  status: string;
  /** The AIP stage's status, or null for a year with no AIP stage. */
  aipStatus: AipCycleStatus | null;
  /**
   * The public sections this year belongs to — `aip`, `annual`, or both.
   * Computed by the API (`computeSections`); the client never re-derives it.
   */
  sections: ('aip' | 'annual')[];
  /** The Budget Cycle's stage, 0–9 (see `budget-cycle.ts`), and those alongside. */
  currentStage: number;
  alongsideStages: number[];
  /**
   * Whether the public Overview may compare this cycle against the previous
   * enacted year. Flipped by hand in the control panel — see
   * `AIPCycle.publicComparisonEnabled`.
   */
  publicComparisonEnabled: boolean;
  /** Per-section Overview switches for this year — see `overviewEnabled`. */
  publicAipOverviewEnabled: boolean;
  publicAnnualOverviewEnabled: boolean;
  publicPpmpOverviewEnabled: boolean;
  /** Newest publish among the programs the public can list (specs/013); null if none. */
  lastPublishedAt: string | null;
  /**
   * The total the enacted ordinance states, and its parts, as decimal strings —
   * a headline only, never summed into anything (specs/013 FR-021).
   */
  statedTotal: string | null;
  statedOfficeTotal: string | null;
  statedSpecialTotal: string | null;
  statedSource: string | null;
  /**
   * The year's enacted budget is an Ordinance (specs/012), which holds every
   * row, special funds included (specs/016): its rows' sum is the headline.
   */
  hasEnactedOrdinance: boolean;
  /** What the rest of the year's Annual book carries (specs/017); absent from an older API. */
  annualBook?: { receipts: boolean; objects: boolean; debt: boolean };
  /**
   * The document the Annual section serves (specs/017 FR-002): `ORDINANCE`
   * once enacted, `LEP` for a historical year known only by its proposal,
   * null when the year has no Annual document.
   */
  annualDocumentKind: 'ORDINANCE' | 'LEP' | null;
}

export interface PublicClusterRecord {
  id: string;
  name: string;
  offices: { id: string; name: string; acronym: string }[];
  finishLineClusters: {
    finishLine: { id: string; name: string; visionNumber: number | null };
  }[];
}

export interface PublicFinishLineRecord {
  id: string;
  name: string;
  visionNumber: number | null;
  shortName: string | null;
  color: string | null;
  programCount: number;
}

export interface PublicPAPSectorRecord {
  id: string;
  code: string;
  name: string;
}

export interface PublicRegistryProjectActivity {
  id: string;
  type: 'PROJECT' | 'ACTIVITY';
  name: string;
  parentProjectActivityId: string | null;
  orderIndex: number;
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  costMode: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  grandTotal: string;
  proposedBudget: string | null;
  /**
   * Funds this PPA draws on. Amount-less by design, so a row naming two funds
   * says nothing about the split — see `budget-overview.ts` for how the public
   * Overview attributes money without double-counting.
   */
  fundSources: string[];
  /** The row's money split by fund, when it states one; empty when declared as a total. */
  fundAllocations?: FundAllocationRecord[];
}

/** One line of a row's per-fund split. Decimal strings, like every amount on the wire. */
export interface FundAllocationRecord {
  fundSource: FundSource;
  ps: string;
  mooe: string;
  fe: string;
  co: string;
}

export interface PublicProgramItem {
  id: string;
  name: string;
  status: string;
  tentativeAipReferenceCode: string | null;
  aipReferenceCode: string | null;
  /**
   * The public headline figure for the program — a stored, published-snapshot-aware
   * column, not a client-side sum of its root PAs. Summing the PAs would disagree
   * with the snapshot mid-revision.
   */
  proposedTotal: string | null;
  /**
   * The funds this program draws on, when the program *is* the funding entry —
   * i.e. it states its own costs and holds no PAs. A program that rolls up from
   * PAs carries its funds on the PAs instead. Amount-less either way: a row
   * naming two funds says nothing about the split.
   */
  fundSources: string[];
  /** Set when the program states its own costs split by fund. */
  fundAllocations?: FundAllocationRecord[];
  grandTotal: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  /** Which appropriation section the row prints under; drives office grouping. */
  papClass: 'GAS' | 'STO' | 'OPERATIONS' | null;
  office: { id: string; name: string; acronym: string; cluster: { id: string; name: string } | null } | null;
  /** Set only on a component program — the office whose sheet it prints under. */
  hostOffice: { id: string; name: string; acronym: string } | null;
  finishLine: { id: string; name: string; visionNumber: number | null } | null;
  papSector: { id: string; code: string; name: string } | null;
  projectActivities: PublicRegistryProjectActivity[];
  feedbackCount: number;
  lastUpdatedAt: string | null;
  /** The program's own directly-applied tags. The registry filter also matches
   * a tag on any of the program's project/activities, which isn't reflected
   * in this field — it stays scoped to the program's own badges. */
  thematicTags?: ThematicTagRef[];
}

export interface PublicRegistryResponse {
  total: number;
  page: number;
  limit: number;
  totalBudget: string;
  totalProposedBudget: string;
  submittedOfficeCount: number;
  totalOfficeCount: number;
  items: PublicProgramItem[];
}

export function apiPublicGetCycles() {
  return apiFetch<PublicCycleRecord[]>('/public/cycles', undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

/** The law behind a fund as of a fiscal year (specs/016 FR-006). */
export interface PublicFundRule {
  fundSource: string;
  effectiveFrom: number;
  legalBasis: string | null;
  description: string;
  /** A floor ("not less than"), as a decimal string, e.g. "20.000". */
  minimumPercent: string | null;
  minimumBase: 'NTA' | 'REGULAR_REVENUE' | 'TOTAL_APPROPRIATION' | null;
}

export function apiPublicGetFundRule(fund: string, fiscalYear: number) {
  return apiFetch<PublicFundRule>(
    `/public/fund-rules/${encodeURIComponent(fund)}?year=${fiscalYear}`,
    undefined,
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  );
}

/** The columns every book line prints beside its budget year (specs/017 FR-004). */
export interface PublicYearColumns {
  pastYearActual: string | null;
  currentFirstSemActual: string | null;
  currentSecondSemEstimate: string | null;
  currentYearTotal: string | null;
}

export interface PublicReceiptLine extends PublicYearColumns {
  id: string;
  parentId: string | null;
  particulars: string;
  printedCode: string | null;
  accountCode: string | null;
  accountTitle: string | null;
  incomeClass: 'RECURRING' | 'NON_RECURRING' | null;
  /** Null = the General Fund's program; set = that enterprise's own sheet. */
  officeAcronym: string | null;
  officeName: string | null;
  amount: string | null;
}

/** A year's Receipts Program, Forms 5 and 6 and PS ceiling (`GET /public/annual/:year/book`). */
export interface PublicAnnualBook {
  fiscalYear: number;
  documentKind: 'LEP' | 'ORDINANCE';
  receipts: PublicReceiptLine[];
  indebtedness: {
    id: string;
    creditor: string;
    purpose: string;
    dateContracted: string | null;
    term: string | null;
    principal: string;
    previousPrincipal: string | null;
    previousInterest: string | null;
    budgetYearPrincipal: string | null;
    budgetYearInterest: string | null;
    balance: string | null;
  }[];
  obligations: { id: string; section: string; particulars: string; amount: string }[];
  printedTotals: { kind: string; scope: string; label: string; amount: string }[];
}

export function apiPublicGetAnnualBook(fiscalYear: number) {
  return apiFetch<PublicAnnualBook>(`/public/annual/${fiscalYear}/book`, undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

/** A year's spending by object (`GET /public/annual/:year/objects`). */
export interface PublicAnnualObjects {
  fiscalYear: number;
  documentKind: 'LEP' | 'ORDINANCE';
  offices: { acronym: string; name: string; lines: number; total: string }[];
  lines: (PublicYearColumns & {
    id: string;
    printedCode: string | null;
    accountCode: string | null;
    title: string | null;
    expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
    amount: string;
  })[];
}

export function apiPublicGetAnnualObjects(fiscalYear: number, office?: string) {
  const q = office ? `?office=${encodeURIComponent(office)}` : '';
  return apiFetch<PublicAnnualObjects>(`/public/annual/${fiscalYear}/objects${q}`, undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

/** One budget year on the open-data list (`GET /open-data/cycles`). */
export interface OpenDataCycleRecord {
  fiscalYear: number;
  document: 'AIP' | 'ANNUAL_BUDGET';
  open: boolean;
  dataAsOf: string | null;
  bundleUrl: string | null;
  /** Each document of an open year, default first, with its own zip (specs/012). */
  documents?: Array<{
    document: 'AIP' | 'ANNUAL_BUDGET';
    dataAsOf: string;
    bundleUrl: string;
  }>;
}

/**
 * Revalidates every 60 s rather than `PUBLIC_REVALIDATE_SECONDS`, so a year a
 * super admin opens shows on /developers within a minute (specs/007 FR-007).
 */
export function apiGetOpenDataCycles() {
  return apiFetch<OpenDataCycleRecord[]>('/open-data/cycles', undefined, {
    revalidate: 60,
  });
}

export function apiPublicGetClusters() {
  return apiFetch<PublicClusterRecord[]>('/public/clusters', undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

export function apiPublicGetFinishLines(cycleId?: string, section?: 'aip' | 'annual') {
  const qs = cycleId ? `?cycleId=${cycleId}${section ? `&section=${section}` : ''}` : '';
  return apiFetch<PublicFinishLineRecord[]>(`/public/finish-lines${qs}`, undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

export function apiPublicGetPAPSectors(cycleId?: string, section?: 'aip' | 'annual') {
  const qs = cycleId ? `?cycleId=${cycleId}${section ? `&section=${section}` : ''}` : '';
  return apiFetch<PublicPAPSectorRecord[]>(`/public/pap-sectors${qs}`);
}

export function apiPublicGetRegistry(params: {
  cycleId: string;
  clusterId?: string;
  officeId?: string;
  finishLineIds?: string[];
  papSectorId?: string;
  thematicTagIds?: string[];
  /** Any of these PAP classes; OPERATIONS also matches a program with none. */
  papClasses?: string[];
  /** Any of these funds, on the program or a PPA; `NONE` for neither. */
  fundSources?: string[];
  search?: string;
  /** Which document of the year: the AIP or the enacted budget (specs/012). */
  section?: 'aip' | 'annual';
  page?: number;
  limit?: number;
}) {
  const qs = new URLSearchParams({ cycleId: params.cycleId });
  if (params.section) qs.set('section', params.section);
  if (params.clusterId) qs.set('clusterId', params.clusterId);
  if (params.officeId) qs.set('officeId', params.officeId);
  if (params.finishLineIds?.length) {
    for (const id of params.finishLineIds) qs.append('finishLineId', id);
  }
  if (params.papSectorId) qs.set('papSectorId', params.papSectorId);
  if (params.thematicTagIds?.length) {
    for (const id of params.thematicTagIds) qs.append('thematicTagId', id);
  }
  for (const c of params.papClasses ?? []) qs.append('papClass', c);
  for (const f of params.fundSources ?? []) qs.append('fundSource', f);
  if (params.search) qs.set('search', params.search);
  if (params.page !== undefined) qs.set('page', String(params.page));
  if (params.limit !== undefined) qs.set('limit', String(params.limit));
  return apiFetch<PublicRegistryResponse>(
    `/public/registry?${qs.toString()}`,
    undefined,
    { revalidate: PUBLIC_REVALIDATE_SECONDS },
  );
}

export interface PublicLineItem {
  id: string;
  expenseClass: string;
  uacsCode: string;
  uacsDescription: string;
  quantity: string;
  unit: string;
  unitCost: string;
  lineTotal: string;
  remarks: string | null;
  orderIndex: number;
}

export interface PublicProjectActivity {
  id: string;
  type: string;
  name: string;
  /** The funds this row draws on (public budget data). */
  fundSources?: string[];
  expectedOutput: string;
  proposedBudget: string | null;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  grandTotal: string;
  orderIndex: number;
  parentProjectActivityId: string | null;
  lineItems: PublicLineItem[];
  /** Tags applied directly to this PA. */
  thematicTags?: ThematicTagRef[];
  /** The parent program's current tags, computed on read. */
  inheritedThematicTags?: ThematicTagRef[];
}

export interface PublicProgramDetail {
  id: string;
  name: string;
  /** The program's own funds; a program that rolls up states them on its PPAs. */
  fundSources?: string[];
  tentativeAipReferenceCode: string;
  aipReferenceCode: string | null;
  status: string;
  aipCycleId: string;
  aipCycle: { id: string; fiscalYear: number };
  officeId: string | null;
  office: { id: string; name: string; acronym: string } | null;
  /**
   * The public headline figure for the program — the stored,
   * published-snapshot-aware column, not a client-side sum of its root PAs. A
   * program that states its own costs holds no PAs at all, so summing them
   * renders it as ₱0.00.
   *
   * `number` is not a mistake: this is served as `snapshot.proposedTotal ??
   * publishedProposedTotal`, and the snapshot is raw JSON — a Decimal column
   * serializes to a string, a snapshotted one comes back as whatever was
   * written. Stringify before any `parseFloat`.
   */
  proposedTotal: string | number | null;
  civilSocietyOrganizationId: string | null;
  civilSocietyOrganization: { id: string; name: string } | null;
  finishLine: { id: string; name: string } | null;
  subFinishLine: { id: string; name: string } | null;
  papSector: { id: string; name: string; code: string } | null;
  papSubsectorCode: string;
  supportingOffices: { office: { id: string; name: string; acronym: string } }[];
  description: string | null;
  remarks: string | null;
  expectedOutput: string;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  grandTotal: string;
  projectActivities: PublicProjectActivity[];
  /** The program's own directly-applied tags. */
  thematicTags?: ThematicTagRef[];
  lastUpdatedAt: string | null;
  /** Set when the program was archived (specs/013): readable, counted nowhere. */
  archived?: { at: string; reason: string | null } | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicVersionListItem {
  id: string;
  version: number;
  submittedAt: string;
  submittedBy: { name: string; role: string } | null;
}

export interface PublicVersionDetail {
  id: string;
  version: number;
  submittedAt: string;
  submittedBy: { name: string; role: string } | null;
  snapshot: unknown;
}

export type ProgramFeedbackCategory = 'GENERAL' | 'CONCERN' | 'SUGGESTION' | 'QUESTION' | 'OTHER';
export type ProgramCommentSentiment = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';

export interface PublicFeedbackItem {
  id: string;
  content: string;
  submitterName: string | null;
  category: ProgramFeedbackCategory | null;
  sentiment: ProgramCommentSentiment | null;
  createdAt: string;
  officialReply: string | null;
  officialRepliedAt: string | null;
  officialReplyEditedAt: string | null;
}

export interface PublicProjectActivityDetail {
  id: string;
  type: string;
  name: string;
  /** The funds it is charged to (an Ordinance PPA carries one). */
  fundSources?: string[];
  description: string | null;
  remarks: string | null;
  expectedOutput: string;
  implementationStartMonth: number | null;
  implementationStartYear: number | null;
  implementationEndMonth: number | null;
  implementationEndYear: number | null;
  proposedBudget: string | null;
  proposedAmount: string;
  psTotal: string;
  mooeTotal: string;
  feTotal: string;
  coTotal: string;
  grandTotal: string;
  orderIndex: number;
  parentProjectActivityId: string | null;
  lineItems: PublicLineItem[];
  /** Tags applied directly to this PA. */
  thematicTags?: ThematicTagRef[];
  /** The parent program's current tags, computed on read. */
  inheritedThematicTags?: ThematicTagRef[];
  children: Array<{
    id: string;
    type: string;
    name: string;
    expectedOutput: string;
    proposedBudget: string | null;
    proposedAmount: string;
    psTotal: string;
    mooeTotal: string;
    feTotal: string;
    coTotal: string;
    grandTotal: string;
    orderIndex: number;
    parentProjectActivityId: string | null;
  }>;
  parent: { id: string; name: string; type: string } | null;
}

export function apiPublicGetProgram(programId: string) {
  return apiFetch<PublicProgramDetail>(`/public/registry/${programId}`);
}

export function apiPublicGetProjectActivity(programId: string, paId: string) {
  return apiFetch<PublicProjectActivityDetail>(
    `/public/registry/${programId}/project-activities/${paId}`,
  );
}

export function apiPublicGetVersions(programId: string) {
  return apiFetch<PublicVersionListItem[]>(`/public/registry/${programId}/versions`);
}

export function apiPublicGetVersion(programId: string, versionId: string) {
  return apiFetch<PublicVersionDetail>(`/public/registry/${programId}/versions/${versionId}`);
}

export function apiPublicGetFeedback(programId: string) {
  return apiFetch<PublicFeedbackItem[]>(`/public/registry/${programId}/feedback`);
}

export function apiPublicSubmitFeedback(
  programId: string,
  dto: {
    submitterName?: string;
    submitterEmail?: string;
    message: string;
    category?: ProgramFeedbackCategory;
    sentiment?: ProgramCommentSentiment;
    recaptchaToken: string;
    website?: string;
  },
  ip?: string | null,
) {
  return apiFetch<{ success: boolean }>(`/public/registry/${programId}/feedback`, {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

export function apiPublicGetPAFeedback(programId: string, paId: string) {
  return apiFetch<PublicFeedbackItem[]>(
    `/public/registry/${programId}/project-activities/${paId}/feedback`,
  );
}

export function apiPublicSubmitPAFeedback(
  programId: string,
  paId: string,
  dto: {
    submitterName?: string;
    submitterEmail?: string;
    message: string;
    recaptchaToken: string;
    website?: string;
  },
  ip?: string | null,
) {
  return apiFetch<{ success: boolean }>(
    `/public/registry/${programId}/project-activities/${paId}/feedback`,
    { method: 'POST', headers: visitorHeaders(ip), body: JSON.stringify(dto) },
  );
}

export type RegistryFeedbackCategory =
  | 'GENERAL'
  | 'SPECIFIC_PPA'
  | 'BUDGET_TRANSPARENCY'
  | 'FINISH_LINE_PROGRESS'
  | 'OTHER'
  | 'PROGRAM_SUGGESTION';

// ─── Admin: Registry Feedback ─────────────────────────────────────────────────

export interface RegistryFeedbackRecord {
  id: string;
  submitterName: string | null;
  submitterEmail: string | null;
  category: RegistryFeedbackCategory;
  message: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedBy: { id: string; firstName: string; lastName: string } | null;
  internalNote: string | null;
}

export interface RegistryFeedbackListResponse {
  items: RegistryFeedbackRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface ProgramFeedbackRecord {
  id: string;
  content: string;
  submitterName: string | null;
  submitterEmail: string | null;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
  resolveNote: string | null;
  /** Set when the feedback is on an enacted budget's PPA; `program` is then its root PPA. */
  budgetItemId?: string | null;
  program: { id: string; name: string };
}

export interface ProgramFeedbackListResponse {
  items: ProgramFeedbackRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface FeedbackCountResponse {
  general: number;
  program: number;
  total: number;
}

export function apiGetAdminRegistryFeedback(
  token: string,
  params?: { category?: string; reviewed?: boolean; deleted?: boolean; page?: number; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.reviewed !== undefined) qs.set('reviewed', String(params.reviewed));
  if (params?.deleted !== undefined) qs.set('deleted', String(params.deleted));
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetchAuth<RegistryFeedbackListResponse>(
    token,
    `/admin/registry-feedback${q ? `?${q}` : ''}`,
  );
}

export function apiReviewRegistryFeedback(
  token: string,
  id: string,
  dto: { internalNote?: string },
) {
  return apiFetchAuth<RegistryFeedbackRecord>(token, `/admin/registry-feedback/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export function apiUnreviewRegistryFeedback(token: string, id: string) {
  return apiFetchAuth<{ id: string; reviewedAt: null; reviewedBy: null; internalNote: null }>(
    token,
    `/admin/registry-feedback/${id}/unreview`,
    { method: 'PATCH' },
  );
}

export function apiDeleteRegistryFeedback(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/admin/registry-feedback/${id}`,
    { method: 'DELETE' },
  );
}

export function apiRestoreRegistryFeedback(token: string, id: string) {
  return apiFetchAuth<{ message: string }>(
    token,
    `/admin/registry-feedback/${id}/restore`,
    { method: 'PATCH' },
  );
}

export function apiGetAdminProgramFeedback(
  token: string,
  params?: { reviewed?: boolean; deleted?: boolean; page?: number; limit?: number },
) {
  const qs = new URLSearchParams();
  if (params?.reviewed !== undefined) qs.set('reviewed', String(params.reviewed));
  if (params?.deleted !== undefined) qs.set('deleted', String(params.deleted));
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetchAuth<ProgramFeedbackListResponse>(
    token,
    `/admin/program-feedback${q ? `?${q}` : ''}`,
  );
}

export function apiReviewProgramFeedback(
  token: string,
  id: string,
  dto: { internalNote?: string },
) {
  return apiFetchAuth<ProgramFeedbackRecord>(token, `/admin/program-feedback/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export function apiGetFeedbackCount(token: string) {
  return apiFetchAuth<FeedbackCountResponse>(token, '/admin/feedback-count');
}

export function apiPublicSubmitRegistryFeedback(dto: {
  submitterName?: string;
  submitterEmail?: string;
  category?: RegistryFeedbackCategory;
  message: string;
  recaptchaToken: string;
  website?: string;
}, ip?: string | null) {
  return apiFetch<{ success: boolean }>('/public/registry/feedback', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

// ─── LFC Approver View ────────────────────────────────────────────────────────

export interface LfcMeRecord {
  isLfcMember: boolean;
  officeId: string | null;
  sequenceOrder: number | null;
}

export interface LfcOfficeStats {
  id: string;
  name: string;
  acronym: string;
  clusterId: string;
  clusterName: string;
  totalProgramCount: number;
  myApprovedCount: number;
  myPendingCount: number;
  myRejectedCount: number;
}

export interface LfcSignatory {
  officeId: string;
  officeName: string;
  sequenceOrder: number;
  isCallerOffice: boolean;
  approvedCount: number;
  pendingCount: number;
  rejectedCount: number;
  lastDecidedByName: string | null;
  lastDecidedAt: string | null;
}

export interface LfcOfficeDetail {
  office: { id: string; name: string; acronym: string };
  stats: {
    totalProgramCount: number;
    myApprovedCount: number;
    myPendingCount: number;
    myRejectedCount: number;
    /** Programs returned for revision that are pausing the office batch. */
    returnedForRevisionCount: number;
  };
  signatories: LfcSignatory[];
}

export interface LfcBatchResult {
  approved?: number;
  returned?: number;
  rejected?: number;
  finalized?: number;
  skipped: number;
}



// ─── LGU Feedback Dashboard ───────────────────────────────────────────────────

export interface LguFeedbackRecord {
  id: string;
  content: string;
  targetType: string;
  targetId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  resolveNote: string | null;
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
  officialReply: string | null;
  officialRepliedAt: string | null;
  officialReplyEditedAt: string | null;
  /** Set when the feedback is on an enacted budget's PPA; `program` is then its root PPA. */
  budgetItemId?: string | null;
  program: {
    id: string;
    name: string;
    status: string;
    aipReferenceCode: string | null;
    tentativeAipReferenceCode: string | null;
  };
}

export interface LguFeedbackListResponse {
  items: LguFeedbackRecord[];
  total: number;
  page: number;
  limit: number;
}

export interface LguFeedbackAnalytics {
  totalCount: number;
  unreviewedCount: number;
  topPrograms: { id: string; name: string; aipReferenceCode: string | null; count: number }[];
  byMonth: { month: string; count: number }[];
  byStatus: { status: string; count: number }[];
}

export function apiGetLguFeedback(
  token: string,
  params?: { cycleId?: string; page?: number; limit?: number; filter?: 'all' | 'pending' | 'reviewed' },
) {
  const qs = new URLSearchParams();
  if (params?.cycleId) qs.set('cycleId', params.cycleId);
  if (params?.page !== undefined) qs.set('page', String(params.page));
  if (params?.limit !== undefined) qs.set('limit', String(params.limit));
  if (params?.filter && params.filter !== 'all') qs.set('filter', params.filter);
  const q = qs.toString();
  return apiFetchAuth<LguFeedbackListResponse>(token, `/lgu/feedback${q ? `?${q}` : ''}`);
}

export function apiReviewLguFeedback(token: string, id: string, note?: string) {
  return apiFetchAuth<{ id: string; resolvedAt: string; resolvedBy: { id: string; firstName: string; lastName: string } | null; resolveNote: string | null }>(
    token,
    `/lgu/feedback/${id}/review`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) },
  );
}

export function apiUnreviewLguFeedback(token: string, id: string) {
  return apiFetchAuth<{ id: string; resolvedAt: null; resolvedBy: null; resolveNote: null }>(
    token,
    `/lgu/feedback/${id}/unreview`,
    { method: 'PATCH' },
  );
}

export function apiSetLguFeedbackReply(token: string, id: string, content: string) {
  return apiFetchAuth<{ id: string; officialReply: string; officialRepliedAt: string; officialReplyEditedAt: string | null }>(
    token,
    `/lgu/feedback/${id}/reply`,
    { method: 'POST', body: JSON.stringify({ content }) },
  );
}

export function apiDeleteLguFeedbackReply(token: string, id: string) {
  return apiFetchAuth<{ id: string; officialReply: null; officialRepliedAt: null; officialReplyEditedAt: null }>(
    token,
    `/lgu/feedback/${id}/reply`,
    { method: 'DELETE' },
  );
}

export function apiGetLguFeedbackAnalytics(
  token: string,
  params?: { cycleId?: string },
) {
  const qs = new URLSearchParams();
  if (params?.cycleId) qs.set('cycleId', params.cycleId);
  const q = qs.toString();
  return apiFetchAuth<LguFeedbackAnalytics>(token, `/lgu/feedback/analytics${q ? `?${q}` : ''}`);
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/**
 * City-wide AIP progress. Deliberately **not** scoped to the caller's office —
 * every authenticated user gets the same figures so the percentages are
 * comparable between offices. See `api/src/dashboard/dashboard.service.ts`.
 *
 * Published vs draft keys on the API side on `publishedVersionId != null`, the
 * same predicate the public registry uses. Money is `proposedTotal`, serialized
 * as a decimal string.
 */
export interface DashboardMoneyBucket {
  total: string;
  ps: string;
  mooe: string;
  fe: string;
  co: string;
}

/**
 * One bar of the fund-source card. `key` is a `FundSource` value, or `MULTIPLE`
 * (a PPA drawing on several funds — its unsplit estimate is bucketed once, never
 * divided or counted twice) or `NONE` (no fund recorded).
 */
export interface DashboardFundSourceTotal {
  key: string;
  total: string;
}

export interface DashboardOfficeRow {
  officeId: string;
  acronym: string;
  name: string;
  total: number;
  drafts: number;
  published: number;
}

export interface DashboardSummary {
  cycleId: string;
  fiscalYear: number;
  cycleStatus: AipCycleStatus;
  totals: {
    programs: number;
    drafts: number;
    published: number;
    /** Legacy rows with no owning office; counted in totals, in no office row. */
    unassignedPrograms: number;
  };
  budget: { published: DashboardMoneyBucket; draft: DashboardMoneyBucket };
  /** Published + draft combined, so it reconciles with `budget`. Descending. */
  byFundSource: DashboardFundSourceTotal[];
  byFinishLine: Array<{
    finishLineId: string;
    name: string;
    color: string | null;
    visionNumber: number | null;
    published: { count: number; total: string };
    draft: { count: number; total: string };
  }>;
  byCluster: Array<{
    clusterId: string;
    name: string;
    officeCount: number;
    officesWithPublished: number;
    offices: DashboardOfficeRow[];
  }>;
  officesWithNoSubmissions: Array<{
    id: string;
    acronym: string;
    name: string;
    clusterName: string;
  }>;
  /** ISO-Monday buckets, gap-filled. Empty when nothing is published yet. */
  publishedByWeek: Array<{ weekStart: string; count: number }>;
}

export function apiGetDashboardSummary(token: string, cycleId?: string) {
  const qs = cycleId ? `?cycleId=${cycleId}` : '';
  return apiFetchAuth<DashboardSummary>(token, `/dashboard/summary${qs}`);
}

// ─── PPMP ───────────────────────────────────────────────────────────────────
// Standalone from Program/ProjectActivity/LineItem on purpose — see
// specs/001-ppmp-creation/research.md Decision 5.

export type PpmpProjectType =
  | 'GOODS'
  | 'SERVICES'
  | 'CONSULTING_SERVICES'
  | 'INFRASTRUCTURE_PROJECTS';

export type PpmpProcurementMode =
  | 'SMALL_VALUE_PROCUREMENT'
  | 'COMPETITIVE_BIDDING'
  | 'NEGOTIATED_PROCUREMENT'
  | 'HIGHLY_TECHNICAL_CONSULTANTS';

export type PpmpClassification =
  | 'GENERAL_ADMINISTRATIVE_SERVICES'
  | 'SUPPORT_TO_OPERATIONS'
  | 'OPERATIONS'
  | 'DIGITALIZATION';

export interface PpmpLineItemRecord {
  id: string;
  ppmpId: string;
  lineItemName: string;
  typeOfProject: PpmpProjectType | null;
  modeOfProcurement: PpmpProcurementMode | null;
  uacsObjectId: string;
  uacsCode: string;
  uacsDescription: string;
  quantity: string;
  unit: string;
  unitCost: string;
  lineTotal: string;
  fundSource: FundSource;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  preProcurementConferenceRequired: boolean;
  procurementStartMonth: number;
  procurementStartYear: number;
  procurementEndMonth: number;
  procurementEndYear: number;
  deliveryPeriod: string | null;
  supportingDocumentUrl: string | null;
  supportingDocumentName: string | null;
  remarks: string | null;
  orderIndex: number;
  /** The budget row this line is bought for, if linked (specs/012 D8): at most one. */
  programId?: string | null;
  projectActivityId?: string | null;
  budgetItemId?: string | null;
  program?: PpmpLinkTarget | null;
  projectActivity?: PpmpLinkTarget | null;
  budgetItem?: PpmpLinkTarget | null;
}

/** A linked budget row, named for display. */
export interface PpmpLinkTarget {
  id: string;
  name: string;
  aipReferenceCode: string | null;
  tentativeAipReferenceCode?: string | null;
}

/** One row a line may link to (`GET /ppmp/:id/link-options`), in reading order. */
export interface PpmpLinkOption {
  field: 'programId' | 'projectActivityId' | 'budgetItemId';
  id: string;
  name: string;
  code: string | null;
  depth: number;
}

export interface PpmpRecord {
  id: string;
  officeId: string;
  aipCycleId: string;
  name: string;
  /** Free text — which AIP Program funds this Project, typed by the office. */
  fundingProgram: string;
  classification: PpmpClassification;
  /** Three-state approval gate — DRAFT at creation, APPROVED unlocks
   *  Publish, REVISION means it was published, then edited, and needs
   *  re-approval + Republish before the edit goes public again. */
  status: 'DRAFT' | 'APPROVED' | 'REVISION';
  approvedAt: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  /** INDICATIVE before the budget is enacted; FINAL is made from it after (specs/012 D9). */
  kind: 'INDICATIVE' | 'FINAL';
  sourcePpmpId: string | null;
  createdAt: string;
  updatedAt: string;
  lineItems: PpmpLineItemRecord[];
  grandTotal: string;
}

export interface PpmpSummaryRecord {
  id: string;
  officeId: string;
  aipCycleId: string;
  name: string;
  fundingProgram: string;
  classification: PpmpClassification;
  status: 'DRAFT' | 'APPROVED' | 'REVISION';
  approvedAt: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  grandTotal: string;
  lineItemCount: number;
}

export function apiCreatePpmp(
  token: string,
  payload: {
    officeId: string;
    aipCycleId: string;
    name: string;
    fundingProgram: string;
    classification: PpmpClassification;
  },
) {
  return apiFetchAuth<PpmpRecord>(token, '/ppmp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiListPpmp(
  token: string,
  params?: { officeId?: string; aipCycleId?: string; isPublished?: boolean },
) {
  const qs = new URLSearchParams();
  if (params?.officeId) qs.set('officeId', params.officeId);
  if (params?.aipCycleId) qs.set('aipCycleId', params.aipCycleId);
  if (params?.isPublished !== undefined) {
    qs.set('isPublished', String(params.isPublished));
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchAuth<PpmpSummaryRecord[]>(token, `/ppmp${suffix}`);
}

export function apiGetPpmp(token: string, id: string) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${id}`);
}

export function apiUpdatePpmp(
  token: string,
  id: string,
  payload: {
    name?: string;
    fundingProgram?: string;
    officeId?: string;
    classification?: PpmpClassification;
  },
) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function apiDeletePpmp(token: string, id: string) {
  return apiFetchAuth<void>(token, `/ppmp/${id}`, { method: 'DELETE' });
}

export function apiSetPpmpLineLink(
  token: string,
  id: string,
  lineItemId: string,
  link: Partial<Record<PpmpLinkOption['field'], string | null>>,
) {
  return apiFetchAuth<PpmpLineItemRecord>(token, `/ppmp/${id}/line-items/${lineItemId}/link`, {
    method: 'PATCH',
    body: JSON.stringify(link),
  });
}

export function apiGetPpmpLinkOptions(token: string, id: string) {
  return apiFetchAuth<PpmpLinkOption[]>(token, `/ppmp/${id}/link-options`);
}

/** A linked budget row the year's PPMP lines add up to more than (a soft warning). */
export interface PpmpBudgetWarning {
  field: PpmpLinkOption['field'];
  id: string;
  name: string;
  code: string | null;
  budget: string;
  linkedTotal: string;
  thisPpmpTotal: string;
  over: string;
  lineItemIds: string[];
  ppmpCount: number;
}

export function apiGetPpmpBudgetWarnings(token: string, id: string) {
  return apiFetchAuth<PpmpBudgetWarning[]>(token, `/ppmp/${id}/budget-warnings`);
}

/** 409 ORDINANCE_NOT_ENACTED / FINAL_EXISTS. */
export function apiCreateFinalPpmp(token: string, id: string) {
  return apiFetchAuth<{
    ppmp: PpmpRecord;
    unmatched: { lineItemId: string; lineItemName: string; reason: 'none' | 'several' }[];
  }>(token, `/ppmp/${id}/create-final`, { method: 'POST' });
}

export function apiApprovePpmp(token: string, id: string) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${id}/approve`, {
    method: 'POST',
  });
}

export function apiPublishPpmp(token: string, id: string) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${id}/publish`, {
    method: 'POST',
  });
}

export function apiUnpublishPpmp(token: string, id: string) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${id}/unpublish`, {
    method: 'POST',
  });
}

export interface PublishAllPpmpResult {
  published: number;
  skipped: number;
  skippedNames: string[];
}

export function apiPublishAllPpmp(
  token: string,
  params?: { officeId?: string; aipCycleId?: string },
) {
  const qs = new URLSearchParams();
  if (params?.officeId) qs.set('officeId', params.officeId);
  if (params?.aipCycleId) qs.set('aipCycleId', params.aipCycleId);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetchAuth<PublishAllPpmpResult>(
    token,
    `/ppmp/publish-all${suffix}`,
    { method: 'POST' },
  );
}

export interface CreatePpmpLineItemPayload {
  lineItemName: string;
  typeOfProject?: PpmpProjectType;
  modeOfProcurement?: PpmpProcurementMode;
  uacsObjectId: string;
  quantity: string;
  unit: string;
  unitCost: string;
  fundSource: FundSource;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
  preProcurementConferenceRequired: boolean;
  procurementStartMonth: number;
  procurementStartYear: number;
  procurementEndMonth: number;
  procurementEndYear: number;
  deliveryPeriod?: string;
  remarks?: string;
  orderIndex?: number;
}

export type UpdatePpmpLineItemPayload = Partial<CreatePpmpLineItemPayload>;

export function apiAddPpmpLineItem(
  token: string,
  ppmpId: string,
  payload: CreatePpmpLineItemPayload,
) {
  return apiFetchAuth<PpmpRecord>(token, `/ppmp/${ppmpId}/line-items`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function apiUpdatePpmpLineItem(
  token: string,
  ppmpId: string,
  lineItemId: string,
  payload: UpdatePpmpLineItemPayload,
) {
  return apiFetchAuth<PpmpRecord>(
    token,
    `/ppmp/${ppmpId}/line-items/${lineItemId}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
}

export function apiDeletePpmpLineItem(
  token: string,
  ppmpId: string,
  lineItemId: string,
) {
  return apiFetchAuth<{ grandTotal: string }>(
    token,
    `/ppmp/${ppmpId}/line-items/${lineItemId}`,
    { method: 'DELETE' },
  );
}

export function apiReorderPpmpLineItems(
  token: string,
  ppmpId: string,
  lineItemIds: string[],
) {
  return apiFetchAuth<PpmpLineItemRecord[]>(
    token,
    `/ppmp/${ppmpId}/line-items/reorder`,
    { method: 'PATCH', body: JSON.stringify({ lineItemIds }) },
  );
}

/**
 * Multipart upload, not JSON — bypasses `apiFetch`'s hardcoded
 * `Content-Type: application/json` so the browser sets its own
 * multipart boundary.
 */
export async function apiUploadPpmpLineItemDocument(
  token: string,
  ppmpId: string,
  lineItemId: string,
  file: File,
): Promise<{ supportingDocumentUrl: string; supportingDocumentName: string }> {
  const form = new FormData();
  form.append('file', file);

  const res = await fetch(
    `${API_URL}/ppmp/${ppmpId}/line-items/${lineItemId}/document`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form },
  );

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const raw = body.message;
    const message = Array.isArray(raw) ? raw.join('; ') : (raw ?? res.statusText);
    throw new Error(message);
  }

  return res.json();
}

// ─── Public PPMP ───────────────────────────────────────────────────────────

export interface PublicPpmpSummaryRecord {
  id: string;
  name: string;
  fundingProgram: string;
  officeId: string;
  office: { id: string; name: string; acronym: string };
  classification: PpmpClassification;
  grandTotal: string;
  lineItemCount: number;
  publishedAt: string;
  createdAt: string;
  /** Bumped by line-item mutations too, not just rename/publish/unpublish. */
  updatedAt: string;
  /** Enables the "Most Feedback" public sort. */
  feedbackCount: number;
}

export interface PublicPpmpRecord {
  id: string;
  name: string;
  fundingProgram: string;
  officeId: string;
  office: { id: string; name: string; acronym: string };
  aipCycle: { id: string; fiscalYear: number };
  classification: PpmpClassification;
  lineItems: PpmpLineItemRecord[];
  grandTotal: string;
  publishedAt: string;
}

export interface PublicPpmpFeedbackItem {
  id: string;
  message: string;
  submitterName: string;
  category: ProgramFeedbackCategory | null;
  sentiment: ProgramCommentSentiment | null;
  createdAt: string;
  officialReply: string | null;
  officialRepliedAt: string | null;
}

export function apiPublicGetPpmpList(cycleId: string, officeId?: string) {
  const qs = new URLSearchParams({ cycleId });
  if (officeId) qs.set('officeId', officeId);
  return apiFetch<PublicPpmpSummaryRecord[]>(`/public/ppmp?${qs.toString()}`);
}

export function apiPublicGetPpmp(id: string) {
  return apiFetch<PublicPpmpRecord>(`/public/ppmp/${id}`);
}

export function apiPublicGetPpmpHistory(id: string) {
  return apiFetch<PpmpHistoryEntry[]>(`/public/ppmp/${id}/history`);
}

export function apiPublicGetPpmpFeedback(id: string) {
  return apiFetch<PublicPpmpFeedbackItem[]>(`/public/ppmp/${id}/feedback`);
}

export function apiPublicSubmitPpmpFeedback(
  id: string,
  dto: {
    submitterName?: string;
    submitterEmail?: string;
    message: string;
    category?: ProgramFeedbackCategory;
    sentiment?: ProgramCommentSentiment;
    recaptchaToken: string;
    website?: string;
  },
  ip?: string | null,
) {
  return apiFetch<{ success: boolean }>(`/public/ppmp/${id}/feedback`, {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

// ─── PPMP comments / feedback / history (authenticated) ────────────────────

export interface PpmpCommentAuthor {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface PpmpCommentRecord {
  id: string;
  ppmpId: string;
  authorUserId: string;
  author: PpmpCommentAuthor;
  parentCommentId: string | null;
  content: string;
  createdAt: string;
  replies?: PpmpCommentRecord[];
}

export function apiListPpmpComments(token: string, ppmpId: string) {
  return apiFetchAuth<PpmpCommentRecord[]>(token, `/ppmp/${ppmpId}/comments`);
}

export function apiAddPpmpComment(
  token: string,
  ppmpId: string,
  payload: { content: string; parentCommentId?: string },
) {
  return apiFetchAuth<PpmpCommentRecord>(token, `/ppmp/${ppmpId}/comments`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface PpmpFeedbackRecord {
  id: string;
  ppmpId: string;
  submitterName: string | null;
  message: string;
  officialReply: string | null;
  officialRepliedAt: string | null;
  officialRepliedByUserId: string | null;
  createdAt: string;
}

export function apiListPpmpFeedback(token: string, ppmpId: string) {
  return apiFetchAuth<PpmpFeedbackRecord[]>(token, `/ppmp/${ppmpId}/feedback`);
}

export function apiReplyToPpmpFeedback(
  token: string,
  ppmpId: string,
  feedbackId: string,
  reply: string,
) {
  return apiFetchAuth<PpmpFeedbackRecord>(
    token,
    `/ppmp/${ppmpId}/feedback/${feedbackId}/reply`,
    { method: 'POST', body: JSON.stringify({ reply }) },
  );
}

export interface PpmpHistoryEntry {
  id: string;
  kind: string;
  at: string;
  summary: string;
}

export function apiGetPpmpHistory(token: string, ppmpId: string) {
  return apiFetchAuth<PpmpHistoryEntry[]>(token, `/ppmp/${ppmpId}/history`);
}

// ─── Data Explorer (specs/018) ─────────────────────────────────────────────

import type { Capabilities as ExploreCapabilities, Catalogue as ExploreCatalogue, ResolvedView as ExploreResolvedView } from '@/lib/explore/view-url';

export function apiExploreCatalogue() {
  return apiFetch<ExploreCatalogue>('/public/explorer/catalogue', undefined, { revalidate: PUBLIC_REVALIDATE_SECONDS });
}

export function apiExploreCapabilities() {
  return apiFetch<ExploreCapabilities>('/public/explorer/capabilities', undefined, { revalidate: 60 });
}

/** The page's own search params, passed through: the API owns the grammar. */
export function apiExploreView(query: URLSearchParams, ip?: string | null) {
  return apiFetch<ExploreResolvedView>(`/public/explorer/view?${query.toString()}`, ip ? { headers: visitorHeaders(ip) } : undefined, { revalidate: 60 });
}

export function apiExploreDefault() {
  return apiFetch<ExploreResolvedView>('/public/explorer/default', undefined, { revalidate: 60 });
}

/** A verdict on an Ask answer (`recordId`) or a template explanation (`view`, its URL query). */
export function apiExploreFeedback(
  dto: ({ recordId: string } | { view: string; lang: string }) & { verdict: 'correct' | 'wrong' | 'unsure'; reason?: string; deviceKey?: string },
  ip?: string | null,
) {
  return apiFetch<void>('/public/explorer/feedback', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

export interface ExploreAskResult {
  recordId: string;
  answeredBy: 'cache' | 'card' | 'model' | 'refused' | 'resting';
  /** Always validated by the API against the current catalogue. */
  view?: import('@/lib/explore/view-url').ExplorerView;
  understood?: string;
  guessed?: string[];
  refusal?: string;
  suggestions?: import('@/lib/explore/view-url').Card[];
  lang: string;
  mode: 'normal' | 'resting';
}

/** A question in English, Filipino or Bikol → a view (specs/018 P3). */
export function apiExploreAsk(dto: { q: string; lang: string; deviceKey?: string; trainingConsent?: true }, ip?: string | null) {
  return apiFetch<ExploreAskResult>('/public/explorer/ask', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

/** The workspace chat's answer (specs/018 redesign P5): every figure is the engine's. */
export interface ExploreChatResult {
  recordId: string;
  mode: 'normal' | 'resting';
  answeredBy: 'cache' | 'card' | 'model' | 'refused' | 'resting';
  /** The question's language: the reply is written in it (W29). */
  lang: 'en' | 'fil' | 'bcl';
  action: 'answer' | 'askBack' | 'refuse';
  reading: string;
  query?: import('./explore/workbook').WorkbookQuery;
  mark?: import('./explore/workbook').Mark;
  sentences: string[];
  coverage?: { byLabels: boolean; unclassified: { amount: string; count: number } | null; draft: boolean };
  ppas?: { total: number; items: { id: string | null; name: string; office: string | null; amount: string | null; href: string | null }[] };
  steps: { id: 'office' | 'subLabel' | 'fund' | 'years'; query: import('./explore/workbook').WorkbookQuery }[];
  alternatives: { label: string; query: import('./explore/workbook').WorkbookQuery }[];
  askBack?: { question: string; options: { label: string; query: import('./explore/workbook').WorkbookQuery }[] };
  /** `not-understood`, `no-data`, `empty`, or the model's own words for an off-topic question. */
  refusal?: string;
}

export function apiExploreChat(
  dto: {
    q: string;
    lang: string;
    deviceKey?: string;
    trainingConsent?: true;
    sheet?: { query: import('./explore/workbook').WorkbookQuery; mark: string } | null;
    turns?: { q: string; reading: string }[];
  },
  ip?: string | null,
) {
  return apiFetch<ExploreChatResult>('/public/explorer/chat', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(dto),
  });
}

export interface ExplorerLogItem {
  id: string;
  text: string | null;
  lang: string;
  answeredBy: string;
  view: import('@/lib/explore/view-url').ExplorerView | null;
  refusal: string | null;
  catalogueVersion: string;
  promptVersion: string | null;
  createdAt: string;
  feedback: { verdict: string; reason: string | null; text: string | null; createdAt: string }[];
  calls: { model: string; ok: boolean; latencyMs: number; promptHash: string; rawOutput: string | null }[];
}

/** Staff: the explorer's question log (permission `explorer:read-log`). */
export function apiGetExplorerLog(token: string, params: { lang?: string; answeredBy?: string; page?: number }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v));
  return apiFetchAuth<{ items: ExplorerLogItem[]; total: number }>(token, `/explorer/log?${qs.toString()}`, { cache: 'no-store' });
}

export interface ExplorerSpend {
  prices: { in: number; out: number };
  calls: { day: string; kind: string; model: string; calls: number; failed: number; tokensIn: number; tokensOut: number; usd: number }[];
  answers: { day: string; answeredBy: string; n: number }[];
}

/** Staff: model spend per day, last 30 days (redesign W7). */
export function apiGetExplorerSpend(token: string) {
  return apiFetchAuth<ExplorerSpend>(token, '/explorer/spend', { cache: 'no-store' });
}

/**
 * A spoken question → its words (specs/018 P4). Multipart, so not `apiFetch`
 * (which sends JSON); the clip passes straight through and is never stored.
 */
export async function apiExploreTranscribe(form: FormData, ip?: string | null) {
  const res = await fetch(`${API_URL}/public/explorer/transcribe`, {
    method: 'POST',
    body: form,
    headers: visitorHeaders(ip),
    cache: 'no-store',
  });
  if (!res.ok) throw Object.assign(new Error(res.statusText), { statusCode: res.status });
  return res.json() as Promise<{ text: string; lang: string; by: string }>;
}

// Workspace (specs/018 redesign P3): sources, the query engine, share links.

export function apiExploreSources() {
  return apiFetch<{ sources: import('./explore/compile').SourceInfo[] }>('/public/explorer/sources', undefined, {
    revalidate: PUBLIC_REVALIDATE_SECONDS,
  });
}

export function apiExploreQuery(query: import('./explore/workbook').WorkbookQuery, ip?: string | null) {
  return apiFetch<import('./explore/compile').QueryResult>('/public/explorer/query', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(query),
  });
}

/** The data grid: the records behind a query, paged (`POST /query/rows`). */
export interface QueryRows {
  /** `derived`: made by the explorer (labels, topics, barangays, words), not the city's data. */
  columns: { field: string; label: string; role: 'dimension' | 'money'; derived?: boolean }[];
  rows: Record<string, string | null | { code: string | null; label: string }[]>[];
  /** An AIP program's projects and activities, by the program's id (specs/020). */
  children?: Record<string, { id: string; name: string; amount: string }[]>;
  total: number;
  offset: number;
  size: number;
}

export function apiExploreRows(body: { query: import('./explore/workbook').WorkbookQuery; offset: number; size: number }, ip?: string | null) {
  return apiFetch<QueryRows>('/public/explorer/query/rows', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify(body),
  });
}

export function apiExploreSaveSnapshot(workbook: import('./explore/workbook').Workbook, ip?: string | null) {
  return apiFetch<{ id: string }>('/public/explorer/snapshots', {
    method: 'POST',
    headers: visitorHeaders(ip),
    body: JSON.stringify({ workbook }),
  });
}

export function apiExploreSnapshot(id: string) {
  return apiFetch<{ workbook: import('./explore/workbook').Workbook }>(
    `/public/explorer/snapshots/${encodeURIComponent(id)}`,
    undefined,
    { revalidate: 86_400 },
  );
}
