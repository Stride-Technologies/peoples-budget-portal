-- Five fund sources the 2027 AIP workbook uses that the enum was missing.
--
-- SHF and EDF come from the city's own official taxonomy — the `Fund Source V2`
-- summary sheet lists twelve funds and our enum carried ten. CCN (City College
-- of Naga income), JOINT_VENTURE and BORROWINGS appear only in the PPA sheets;
-- they are kept as real values rather than folded into GF so the import never
-- misreports where a peso comes from.
--
-- Purely additive: no existing row references these, and `fund_sources` already
-- defaults to an empty array. Enum-only on purpose — nothing here may use the
-- new values in the same migration.

-- AlterEnum
ALTER TYPE "FundSource" ADD VALUE 'SHF';
ALTER TYPE "FundSource" ADD VALUE 'EDF';
ALTER TYPE "FundSource" ADD VALUE 'CCN';
ALTER TYPE "FundSource" ADD VALUE 'JOINT_VENTURE';
ALTER TYPE "FundSource" ADD VALUE 'BORROWINGS';
