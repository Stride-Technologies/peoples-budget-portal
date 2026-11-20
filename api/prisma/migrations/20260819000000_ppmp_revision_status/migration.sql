-- Three-state approval gate: DRAFT / APPROVED / REVISION. REVISION is
-- reached only from APPROVED, only when the Project was already published
-- at the moment of the edit — a fresh, never-published Project still
-- reverts to plain DRAFT on edit, same as before. Entering REVISION also
-- flips is_published back to false (see PpmpService.draftRevertPatch),
-- which is what actually hides the pending edit from the public site;
-- published_at is left untouched so the client can tell "never published"
-- (Publish) apart from "published before, now under revision" (Republish).
ALTER TYPE "PpmpStatus" ADD VALUE 'REVISION';
