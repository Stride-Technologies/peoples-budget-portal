-- Unlink PPMP from Program (reverses specs/005 research.md Decision 2):
-- funding_program becomes a free-text field the office types directly,
-- instead of a required FK whose name/code were auto-derived. Backfilled
-- from the linked Program's own AIP reference code so the two live rows
-- created under the old flow keep an identifying value instead of an
-- empty field.
ALTER TABLE "ppmps" ADD COLUMN "funding_program" TEXT;

UPDATE "ppmps" p
  SET "funding_program" = COALESCE(prog."aip_reference_code", prog."tentative_aip_reference_code", prog."name")
  FROM "programs" prog
  WHERE prog."id" = p."program_id";

ALTER TABLE "ppmps" ALTER COLUMN "funding_program" SET NOT NULL;

ALTER TABLE "ppmps" DROP CONSTRAINT "ppmps_program_id_fkey";
DROP INDEX "ppmps_program_id_key";
ALTER TABLE "ppmps" DROP COLUMN "program_id";
ALTER TABLE "ppmps" DROP COLUMN "aip_reference_code";

-- Public feedback on a Project now carries the same optional
-- category/sentiment Program feedback does — reuses the existing enum
-- types (see 20260610100000_add_program_comment_feedback_fields), not new
-- ones, so the public form and its rendering can be identical to AIP's.
ALTER TABLE "ppmp_feedback"
  ADD COLUMN "category" "ProgramFeedbackCategory",
  ADD COLUMN "sentiment" "ProgramCommentSentiment";
