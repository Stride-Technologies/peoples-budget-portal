-- Phase 1 — carry the intended permissions and office scope on the invite.
-- See docs/design/phase-1-publish-scope.md §5.
--
-- The User row does not exist until an invite is accepted, so the grants an
-- administrator chooses at invite time have nowhere else to live until then.
-- `auth.setPassword` materializes them into user_permissions / user_office_scopes
-- in the same transaction that creates the user.
--
-- Plain arrays rather than join tables: an invite is short-lived, its payload is
-- never queried by key, and keeping it denormalized means user_permissions and
-- user_office_scopes stay the only tables anything reads for authorization.

ALTER TABLE "user_invites"
  ADD COLUMN "permissions"          TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "all_offices_scope"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "office_scope_ids"     TEXT[]  NOT NULL DEFAULT ARRAY[]::TEXT[],
  -- Recorded so the grant's audit column names whoever chose the access, rather
  -- than the invitee appearing to have granted it to themselves.
  ADD COLUMN "invited_by_user_id"   TEXT;

ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_invited_by_user_id_fkey"
  FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "user_invites_invited_by_user_id_idx" ON "user_invites"("invited_by_user_id");

-- No backfill: pending invites created before this keep empty grants, which is
-- the correct reading — nobody chose any for them. An administrator grants
-- access from the user's key icon after they accept.
