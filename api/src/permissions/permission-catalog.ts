/**
 * Single source of truth for every permission key the portal recognises.
 *
 * Three consumers read from this catalog:
 *   1. `PermissionCatalogSyncService` mirrors entries into the `permissions` table
 *      on application bootstrap, so the control-panel UI (which queries the DB)
 *      always sees the same keys the code declares.
 *   2. `prisma/seed.ts` imports it for fresh-DB seeding, along with
 *      {@link PERMISSION_TEMPLATES}.
 *   3. `PermissionGuard` gates routes on the keys via `@RequirePermission()`.
 *
 * Permissions are **grant-only** (Phase 1 D11): a `UserPermission` row is a grant,
 * absence is denial, and `Role` contributes nothing at runtime beyond the
 * `SUPER_ADMIN` bypass. The templates below are presets that *materialize* rows —
 * they are not runtime inheritance.
 *
 * `enforced` distinguishes keys actually gated at runtime from forward-looking keys
 * reserved for later phases. Reserved keys are still grantable (they appear in the
 * control panel) but nothing gates on them yet — granting one is harmless until
 * something adopts the key.
 *
 * `PermissionCatalogSyncService` cross-checks every `enforced: true` entry against
 * the keys `PermissionRegistry` discovered from `@RequirePermission()` decorators
 * and warns on drift in both directions, so a lie here is caught loudly at boot.
 *
 * When adding a key: add the entry here *and* the `@RequirePermission()` decorator
 * in the same commit, or omit `enforced` to reserve the key without wiring it.
 *
 * See `docs/design/phase-1-publish-scope.md` §5.
 */
export interface PermissionDefinition {
  key: string;
  label: string;
  module: string;
  description: string;
  enforced?: boolean;
}

export const PERMISSION_CATALOG: PermissionDefinition[] = [
  // --- aip ---
  {
    key: 'aip:read',
    label: 'View AIP entries',
    module: 'aip',
    description:
      'View programs, project/activities, versions, activity streams',
    enforced: true,
  },
  {
    key: 'aip:write',
    label: 'Encode AIP entries',
    module: 'aip',
    description:
      'Create and edit programs and project/activities, including cost estimates',
    enforced: true,
  },
  {
    key: 'aip:delete',
    label: 'Delete AIP entries',
    module: 'aip',
    description: 'Soft-delete a program',
    enforced: true,
  },
  {
    key: 'aip:publish',
    label: 'Publish AIP entries',
    module: 'aip',
    description:
      'Publish and republish; assigns the final AIP reference code on first publish',
    enforced: true,
  },
  {
    key: 'aip:export',
    label: 'Export AIP workbook',
    module: 'aip',
    description: 'Export the cluster workbook',
    enforced: true,
  },
  {
    key: 'aip:audit',
    label: 'View edit history',
    module: 'aip',
    description: 'View the edit history / event log for a program or PPA',
    enforced: true,
  },
  {
    key: 'aip:tag',
    label: 'Tag programs and PPAs',
    module: 'aip',
    description:
      'Apply or remove thematic tags on a program or project/activity',
    enforced: true,
  },

  // --- comments ---
  {
    key: 'comments:read',
    label: 'Read comments',
    module: 'comments',
    description: 'Read internal comment threads',
    enforced: true,
  },
  {
    key: 'comments:write',
    label: 'Post comments',
    module: 'comments',
    description: 'Post internal comments and replies',
    enforced: true,
  },
  {
    key: 'comments:resolve',
    label: 'Resolve comments',
    module: 'comments',
    description: 'Resolve and unresolve comment threads',
    enforced: true,
  },
  {
    key: 'comments:moderate',
    label: 'Moderate comments',
    module: 'comments',
    description: 'Soft-delete and restore any comment',
    enforced: true,
  },

  // --- public feedback ---
  {
    key: 'public_comments:view',
    label: 'View public feedback',
    module: 'public-feedback',
    description: 'See public feedback and analytics in the portal',
    enforced: true,
  },
  {
    key: 'public_comments:reply',
    label: 'Reply to public feedback',
    module: 'public-feedback',
    description: 'Post, edit, and delete the official public reply',
    enforced: true,
  },
  {
    key: 'public_comments:moderate',
    label: 'Moderate public feedback',
    module: 'public-feedback',
    description: 'Mark reviewed/unreviewed, soft-delete, restore',
    enforced: true,
  },

  // --- cycles ---
  {
    key: 'cycles:read',
    label: 'View AIP cycles',
    module: 'cycles',
    description:
      "View a cycle's details and budget ceilings (listing cycles needs only aip:read)",
    enforced: true,
  },
  {
    key: 'cycles:write',
    label: 'Manage AIP cycles',
    module: 'cycles',
    description: 'Create cycles and change cycle status',
    enforced: true,
  },
  {
    key: 'ceilings:write',
    label: 'Manage budget ceilings',
    module: 'cycles',
    description: 'Create, update, and delete finish-line budget ceilings',
    enforced: true,
  },

  // --- budget documents (specs/012) ---
  {
    key: 'budget:read',
    label: 'View budget documents',
    module: 'budget',
    description:
      'View LEPs and Ordinances: their PPAs, object-of-expenditure lines and history',
    enforced: true,
  },
  {
    key: 'budget:write',
    label: 'Review budget documents',
    module: 'budget',
    description:
      'Mark imported PPAs reviewed and finalize an LEP (submit) or Ordinance (enact)',
    enforced: true,
  },

  // --- reference data ---
  {
    key: 'reference:read',
    label: 'Read reference data',
    module: 'reference',
    description: 'Read reference data including inactive rows',
    enforced: true,
  },
  {
    key: 'reference:write',
    label: 'Maintain reference data',
    module: 'reference',
    description: 'Create and update reference data',
    enforced: true,
  },

  // --- users ---
  {
    key: 'users:read',
    label: 'View users',
    module: 'users',
    description: 'View users, invites, audit logs, and the permission catalog',
    enforced: true,
  },
  {
    key: 'users:write',
    label: 'Manage users',
    module: 'users',
    description: 'Invite and edit users, grant permissions and office scope',
    enforced: true,
  },

  // --- reserved: line-item cost assumptions (not enforced yet) ---
  {
    key: 'line_items:read',
    label: 'View cost assumptions',
    module: 'aip-detail',
    description: 'Reserved — line-item cost assumptions (not enforced yet)',
  },
  {
    key: 'line_items:write',
    label: 'Edit cost assumptions',
    module: 'aip-detail',
    description: 'Reserved — line-item cost assumptions (not enforced yet)',
  },

  // --- explorer (specs/018) ---
  {
    key: 'explorer:read-log',
    label: 'Read the Data Explorer question log',
    module: 'explorer',
    description:
      'Questions residents asked the Data Explorer, the model calls behind each answer, and their feedback (personal data)',
    enforced: true,
  },

  // --- reserved: the archived approval workflow (a redesigned review flow will replace it) ---
  {
    key: 'approvals:decide',
    label: 'Record LFC decisions',
    module: 'approvals',
    description: 'Reserved — committee approval (paused)',
  },
  {
    key: 'endorsements:record',
    label: 'Record endorsements',
    module: 'approvals',
    description: 'Reserved — advisory endorsement (paused)',
  },
];

export const PERMISSION_CATALOG_KEYS: readonly string[] =
  PERMISSION_CATALOG.map((p) => p.key);

/**
 * Seed presets for the control-panel "apply a template" row. Applying one writes
 * explicit `UserPermission` rows; every key stays independently editable
 * afterwards. Office scope is chosen separately (D2) and is not part of a template.
 *
 * `aip:publish` is deliberately isolated to CPDO Head — publication is the act that
 * makes a figure public and assigns the final AIP code. Encoders save drafts freely
 * (D8); they just cannot push one public.
 *
 * The Office Head template is read + comment (D20). Write access on one's own
 * office is a per-user exception, not a template.
 */
export const PERMISSION_TEMPLATES: Record<string, string[]> = {
  'CPDO Head': [
    'aip:read',
    'aip:write',
    'aip:delete',
    'aip:publish',
    'aip:export',
    'aip:audit',
    'aip:tag',
    'comments:read',
    'comments:write',
    'comments:resolve',
    'comments:moderate',
    'public_comments:view',
    'public_comments:reply',
    'public_comments:moderate',
    'cycles:read',
    'cycles:write',
    'ceilings:write',
    'budget:read',
    'budget:write',
    'reference:read',
    'users:read',
    'users:write',
    'explorer:read-log',
  ],
  'CPDO Secretariat': [
    'aip:read',
    'aip:write',
    'aip:export',
    'aip:audit',
    'aip:tag',
    'comments:read',
    'comments:write',
    'comments:resolve',
    'public_comments:view',
    'budget:read',
    'reference:read',
  ],
  'Intern / Authorized Encoder': [
    'aip:read',
    'aip:write',
    'aip:tag',
    'comments:read',
    'comments:resolve',
    'reference:read',
  ],
  CMO: [
    'aip:read',
    'aip:export',
    'aip:audit',
    'comments:read',
    'comments:write',
    'public_comments:view',
    'budget:read',
  ],
  CBO: [
    'aip:read',
    'aip:export',
    'aip:audit',
    'comments:read',
    'comments:write',
    'public_comments:view',
    'budget:read',
    'budget:write',
  ],
  'Office Head / Representative': [
    'aip:read',
    'comments:read',
    'comments:write',
    'comments:resolve',
    'public_comments:view',
    'budget:read',
  ],
  NCPC: ['aip:read', 'aip:tag', 'comments:read', 'comments:write'],
};
