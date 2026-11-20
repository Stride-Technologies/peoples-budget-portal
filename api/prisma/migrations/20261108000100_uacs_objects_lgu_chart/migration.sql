-- specs/017 T003: the AIP object list carried 12 capital-outlay codes from the
-- national-agency chart (1-06-xx) or the wrong LGU account (1-07-01-010 is Land).
-- Re-code them in place to COA's LGU chart: same row ids, so every AIP and PPMP
-- line item that points at one keeps pointing at it, now under the right code.
-- Skipped where the right code already exists as its own row.

UPDATE "uacs_objects" SET "code" = '1070401000', "description" = 'Buildings' WHERE "code" = '1060401000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070401000');
UPDATE "uacs_objects" SET "code" = '1070402000', "description" = 'School Buildings' WHERE "code" = '1060402000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070402000');
UPDATE "uacs_objects" SET "code" = '1070403000', "description" = 'Hospitals and Health Centers' WHERE "code" = '1060403000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070403000');
UPDATE "uacs_objects" SET "code" = '1070404000', "description" = 'Markets' WHERE "code" = '1060404000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070404000');
UPDATE "uacs_objects" SET "code" = '1070502000', "description" = 'Office Equipment' WHERE "code" = '1060501000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070502000');
UPDATE "uacs_objects" SET "code" = '1070503000', "description" = 'Information and Communication Technology Equipment' WHERE "code" = '1060503000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070503000');
UPDATE "uacs_objects" SET "code" = '1070601000', "description" = 'Motor Vehicles' WHERE "code" = '1060601000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070601000');
UPDATE "uacs_objects" SET "code" = '1070701000', "description" = 'Furniture and Fixtures' WHERE "code" = '1060801000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070701000');
UPDATE "uacs_objects" SET "code" = '1070301000', "description" = 'Road Networks' WHERE "code" = '1070101000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070301000');
UPDATE "uacs_objects" SET "code" = '1070302000', "description" = 'Flood Control Systems' WHERE "code" = '1070102000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070302000');
UPDATE "uacs_objects" SET "code" = '1070303000', "description" = 'Sewer Systems' WHERE "code" = '1070103000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070303000');
UPDATE "uacs_objects" SET "code" = '1070304000', "description" = 'Water Supply Systems' WHERE "code" = '1070104000' AND NOT EXISTS (SELECT 1 FROM "uacs_objects" WHERE "code" = '1070304000');

-- Line items keep a copy of the code and title as written; bring the copies on
-- the re-coded objects up to date. Published versions' snapshots are history
-- and stay as they were.
UPDATE "line_items" li
SET "uacs_code" = u."code", "uacs_description" = u."description"
FROM "uacs_objects" u
WHERE li."uacs_object_id" = u."id"
  AND li."uacs_code" IN ('1060401000', '1060402000', '1060403000', '1060404000', '1060501000', '1060503000', '1060601000', '1060801000', '1070101000', '1070102000', '1070103000', '1070104000');

UPDATE "ppmp_line_items" li
SET "uacs_code" = u."code", "uacs_description" = u."description"
FROM "uacs_objects" u
WHERE li."uacs_object_id" = u."id"
  AND li."uacs_code" IN ('1060401000', '1060402000', '1060403000', '1060404000', '1060501000', '1060503000', '1060601000', '1060801000', '1070101000', '1070102000', '1070103000', '1070104000');
