-- AIPCodeCounter: atomic counters for tentative + final code assignment.
-- scope_key encodes "{cycleId}:{proponentType}:{officeOrCsoId}:{papSectorId}:{tentative|final}"
-- for Program codes, and "{programId}:{tentative|final}" for ProjectActivity codes.

CREATE TABLE "aip_code_counters" (
    "id"          TEXT         NOT NULL,
    "scope_key"   TEXT         NOT NULL,
    "next_value"  INTEGER      NOT NULL DEFAULT 1,
    "updated_at"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "aip_code_counters_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "aip_code_counters_scope_key_key" ON "aip_code_counters"("scope_key");
