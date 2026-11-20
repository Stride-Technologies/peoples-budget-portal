-- Consolidate `city_offices` + `dbm_offices` into a single `offices` table.
--
-- RENAME, never re-create: `city_offices` carries 9 inbound FK columns and live
-- rows referenced by users, programs, approvals and endorsements. Renaming the
-- table repoints every one of them for free and moves no data.
--
-- Postgres does NOT rename a table's constraints or indexes when the table or
-- its columns are renamed, so every affected identifier is renamed explicitly
-- below. Without that, the next `prisma migrate dev` sees drift and generates a
-- destructive corrective migration. The target names are exactly what
-- `prisma migrate diff --from-empty --to-schema` emits for the new schema.

-- ---------------------------------------------------------------------------
-- 1. The table itself
-- ---------------------------------------------------------------------------

ALTER TABLE "city_offices" RENAME TO "offices";

-- ---------------------------------------------------------------------------
-- 2. New columns. `office_type`/`office_code` are nullable: offices that were
--    never mapped to a DBM row have no code to inherit, and AIPCodesService
--    rejects those at program-create time rather than emitting a bad code.
-- ---------------------------------------------------------------------------

ALTER TABLE "offices"
  ADD COLUMN "lgu_level"   INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN "office_type" "OfficeType",
  ADD COLUMN "office_code" TEXT;

-- ---------------------------------------------------------------------------
-- 3. Fold the DBM catalog down onto the surviving rows, then drop it.
--    Offices with a NULL dbm_office_id simply keep NULL code/type.
-- ---------------------------------------------------------------------------

UPDATE "offices" o
   SET "office_code" = d."code",
       "office_type" = d."office_type"
  FROM "dbm_offices" d
 WHERE o."dbm_office_id" = d."id";

ALTER TABLE "offices" DROP COLUMN "dbm_office_id";  -- drops city_offices_dbm_office_id_fkey

DROP TABLE "dbm_offices";

-- ---------------------------------------------------------------------------
-- 4. FK columns on the 9 referencing tables
-- ---------------------------------------------------------------------------

ALTER TABLE "committee_memberships"       RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "lgu_users"                   RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "program_approval_batches"    RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "program_approvals"           RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "program_supporting_offices"  RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "programs"                    RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "user_invites"                RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "user_office_scopes"          RENAME COLUMN "city_office_id" TO "office_id";
ALTER TABLE "program_endorsements"
  RENAME COLUMN "endorser_city_office_id" TO "endorser_office_id";

-- The three partial unique indexes on program_endorsements
-- (program_endorsements_lgu_unique, _ncpc_cso_unique, _ncpc_umbrella_unique)
-- are raw-SQL only — @@unique cannot express a WHERE clause — and their names
-- carry no table/column reference, so the rename above updates their stored
-- predicates automatically and they need no further work here.

-- ---------------------------------------------------------------------------
-- 5. Constraint names
-- ---------------------------------------------------------------------------

ALTER TABLE "offices"
  RENAME CONSTRAINT "city_offices_pkey" TO "offices_pkey";
ALTER TABLE "offices"
  RENAME CONSTRAINT "city_offices_cluster_id_fkey" TO "offices_cluster_id_fkey";

ALTER TABLE "committee_memberships"
  RENAME CONSTRAINT "committee_memberships_city_office_id_fkey" TO "committee_memberships_office_id_fkey";
ALTER TABLE "lgu_users"
  RENAME CONSTRAINT "lgu_users_city_office_id_fkey" TO "lgu_users_office_id_fkey";
ALTER TABLE "program_approval_batches"
  RENAME CONSTRAINT "program_approval_batches_city_office_id_fkey" TO "program_approval_batches_office_id_fkey";
ALTER TABLE "program_approvals"
  RENAME CONSTRAINT "program_approvals_city_office_id_fkey" TO "program_approvals_office_id_fkey";
ALTER TABLE "program_supporting_offices"
  RENAME CONSTRAINT "program_supporting_offices_city_office_id_fkey" TO "program_supporting_offices_office_id_fkey";
ALTER TABLE "programs"
  RENAME CONSTRAINT "programs_city_office_id_fkey" TO "programs_office_id_fkey";
ALTER TABLE "user_office_scopes"
  RENAME CONSTRAINT "user_office_scopes_city_office_id_fkey" TO "user_office_scopes_office_id_fkey";
ALTER TABLE "program_endorsements"
  RENAME CONSTRAINT "program_endorsements_endorser_city_office_id_fkey" TO "program_endorsements_endorser_office_id_fkey";

-- ---------------------------------------------------------------------------
-- 6. Index names.
--    Two of these are currently truncated at Postgres's 63-char identifier
--    limit; the shorter column name fits, so their new names are NOT truncated.
-- ---------------------------------------------------------------------------

ALTER INDEX "committee_memberships_city_office_id_idx"
  RENAME TO "committee_memberships_office_id_idx";
ALTER INDEX "committee_memberships_committee_id_city_office_id_key"
  RENAME TO "committee_memberships_committee_id_office_id_key";
ALTER INDEX "lgu_users_city_office_id_idx"
  RENAME TO "lgu_users_office_id_idx";
ALTER INDEX "program_approval_batches_aip_cycle_id_city_office_id_idx"
  RENAME TO "program_approval_batches_aip_cycle_id_office_id_idx";
ALTER INDEX "programs_city_office_id_idx"
  RENAME TO "programs_office_id_idx";
ALTER INDEX "user_office_scopes_city_office_id_idx"
  RENAME TO "user_office_scopes_office_id_idx";

-- truncated at 63 chars today ("..._city_offi_key")
ALTER INDEX "program_approvals_program_version_id_committee_id_city_offi_key"
  RENAME TO "program_approvals_program_version_id_committee_id_office_id_key";

-- truncated at 63 chars today (trailing "_idx" lost)
ALTER INDEX "programs_aip_cycle_id_city_office_id_pap_sector_id_order_index_"
  RENAME TO "programs_aip_cycle_id_office_id_pap_sector_id_order_index_idx";
