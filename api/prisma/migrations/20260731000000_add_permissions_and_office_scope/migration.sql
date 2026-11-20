-- Phase 1 D11/D2 — named permission keys + explicit office scope.
-- See docs/design/phase-1-publish-scope.md §5.
--
-- Additive only: no existing column is altered or dropped. Every existing user
-- keeps today's access because OfficeScopeService unions these grants with the
-- user's home office (LGUUser.city_office_id), so no backfill is required.

-- Administrative audit actions for grant changes.
ALTER TYPE "UserAuditAction" ADD VALUE 'PERMISSIONS_CHANGED';
ALTER TYPE "UserAuditAction" ADD VALUE 'OFFICE_SCOPE_CHANGED';

-- Fast path for "may act on every office". The office id list itself is resolved
-- per request (Redis-cached) and is deliberately NOT carried in the JWT.
ALTER TABLE "users" ADD COLUMN "all_offices_scope" BOOLEAN NOT NULL DEFAULT false;

-- Catalog mirror. The source of truth is api/src/permissions/permission-catalog.ts;
-- PermissionCatalogSyncService upserts this table at every application bootstrap
-- and deactivates (never deletes) keys that leave the catalog.
CREATE TABLE "permissions" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "enforced" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- Grant-only: a row is a grant, absence is denial. Role contributes nothing at
-- runtime beyond the SUPER_ADMIN bypass.
CREATE TABLE "user_permissions" (
    "user_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("user_id","key")
);

CREATE INDEX "user_permissions_key_idx" ON "user_permissions"("key");
CREATE INDEX "user_permissions_granted_by_idx" ON "user_permissions"("granted_by");

-- Stored per office, never per cluster: the control panel groups the picker by
-- cluster, but a cluster reorganisation must not silently change access.
CREATE TABLE "user_office_scopes" (
    "user_id" TEXT NOT NULL,
    "city_office_id" TEXT NOT NULL,
    "granted_by" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_office_scopes_pkey" PRIMARY KEY ("user_id","city_office_id")
);

CREATE INDEX "user_office_scopes_city_office_id_idx" ON "user_office_scopes"("city_office_id");
CREATE INDEX "user_office_scopes_granted_by_idx" ON "user_office_scopes"("granted_by");

ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_key_fkey"
    FOREIGN KEY ("key") REFERENCES "permissions"("key") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_granted_by_fkey"
    FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "user_office_scopes" ADD CONSTRAINT "user_office_scopes_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_office_scopes" ADD CONSTRAINT "user_office_scopes_city_office_id_fkey"
    FOREIGN KEY ("city_office_id") REFERENCES "city_offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_office_scopes" ADD CONSTRAINT "user_office_scopes_granted_by_fkey"
    FOREIGN KEY ("granted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
