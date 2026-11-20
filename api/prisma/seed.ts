import { AccountGroup, PrismaClient } from '../src/generated/prisma/index';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { PERMISSION_CATALOG } from '../src/permissions/permission-catalog';
import { THEMATIC_TAGS } from './data/thematic-tags';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// ─── Types ───────────────────────────────────────────────────────────────────

type FinishLineSeed = {
  visionNumber: number;
  name: string;
  fullName: string;
  shortName: string;
  color: string;
};

type OfficeSeed = {
  acronym: string;
  name: string;
  code: string;
  officeType: 'MANDATORY' | 'OPTIONAL' | 'OTHERS';
  cluster: string;
  /**
   * 4-digit PAP sector code — the office's default, pre-filling the sector on
   * every program it proposes. Eight offices were blank on the city's coding
   * sheet (OCVM, OSSP, ACTO, LDF, NCCDO, ABE, NCCWPC, NCCW/NCGADC); they now
   * carry the code their cluster siblings use, because a blank one left the
   * create-program form with no sector and no AIP code. Still optional: a new
   * office may arrive uncoded, and an admin can set it in Control Panel.
   */
  papSector?: string;
  /**
   * Which sheet the office prints on in the complete-AIP workbook, when that
   * is not what its `papSector` implies. Normally absent — the export derives
   * the group from the sector. Only the nine offices the budget office's own
   * workbook files elsewhere carry it.
   */
  aipSectorGroup?: 'GENERAL_PUBLIC' | 'ECONOMIC' | 'ENVI_INFRA' | 'SOCIAL';
  /**
   * LBP Form 7 column, for the 38 offices the FY2026 ordinance's sector summary
   * names (specs/008 research R5). Absent for the rest: the seed derives theirs
   * from `papSector` and lists them for the budget office to review.
   */
  form7Column?: Form7ColumnSeed;
  /**
   * `false` retires the office: SPAF, LDF and LDRRMF since specs/016, which made
   * special funds funds. Only ever deactivates — an absent key leaves an admin's
   * choice alone. A retired office gets no Form 7 column.
   */
  isActive?: false;
};

type Form7ColumnSeed =
  | 'GENERAL_PUBLIC'
  | 'SOCIAL'
  | 'ECONOMIC'
  | 'ECONOMIC_ENTERPRISE';

/** Form 7 column for an office the ordinance doesn't name, by PAP sector. */
const FORM7_COLUMN_BY_SECTOR: Record<string, Form7ColumnSeed> = {
  '1000': 'GENERAL_PUBLIC',
  '3000': 'SOCIAL',
  '8000': 'ECONOMIC',
};

type ClusterSeed = {
  name: string;
  fullName: string;
  visions: number[];
};

type PAPSectorSeed = {
  code: string;
  name: string;
};

type UACSSeed = {
  code: string;
  description: string;
  expenseClass: 'PS' | 'MOOE' | 'FE' | 'CO';
};

type CCETSeed = {
  code: string;
  pillar: 'ADAPTATION' | 'MITIGATION' | 'CROSSCUTTING';
  name: string;
  description?: string;
};

type SGLGSeed = {
  pillar: string;
  code: string;
  name: string;
};

type SDGSeed = {
  code: string;
  name: string;
};

type CSOSeed = {
  code: string;
  name: string;
  clusterName: string;
};

// ─── Data loaders ────────────────────────────────────────────────────────────

function loadData<T>(file: string): T {
  return JSON.parse(readFileSync(join(__dirname, 'data', file), 'utf-8')) as T;
}

/**
 * The folder that holds one LGU's own reference data: its offices, goals and clusters
 * (`data/sample-city/README.md` describes the files). `SEED_CITY_DIR` is a folder under
 * `prisma/data/`, or an absolute path; the sample city when unset.
 */
if (!process.env.SEED_CITY_DIR && process.env.NODE_ENV === 'production')
  throw new Error(
    'SEED_CITY_DIR is not set: in production, name your city folder (the default is the sample city).',
  );
const CITY_DIR = isAbsolute(process.env.SEED_CITY_DIR ?? '')
  ? process.env.SEED_CITY_DIR!
  : join(__dirname, 'data', process.env.SEED_CITY_DIR ?? 'sample-city');

/** A file of the city's folder; `fallback` makes it optional. */
function loadCity<T>(file: string, fallback?: T): T {
  const path = join(CITY_DIR, file);
  if (fallback !== undefined && !existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

type SubFinishLineSeed = {
  finishLineVisionNumber: number;
  code: string;
  name: string;
};

// The LGU's own: goals ("finish lines" in the schema), sub-goals, clusters, offices.
const FINISH_LINES = loadCity<FinishLineSeed[]>('goals.json');
const SUB_FINISH_LINES = loadCity<SubFinishLineSeed[]>('sub-goals.json', []);
const CLUSTERS = loadCity<ClusterSeed[]>('clusters.json');
const OFFICES = loadCity<OfficeSeed[]>('offices.json');
/**
 * Office acronyms the LGU renamed rather than replaced: `{ "OLD": "NEW" }`. Matched before
 * the acronym lookup so the existing row is updated in place and every user, program and
 * approval pointing at it follows the rename, instead of a second office row being created.
 */
const RENAMED_ACRONYMS = loadCity<Record<string, string>>(
  'office-aliases.json',
  {},
);
// National reference data, the same for every LGU.
const PAP_SECTORS = loadData<PAPSectorSeed[]>('pap-sectors.json');
const UACS_OBJECTS = loadData<UACSSeed[]>('uacs-objects.json');
/** COA's LGU chart of accounts (specs/017): what imported book lines resolve to. */
const CHART_OF_ACCOUNTS = loadData<
  {
    code: string;
    code10: string | null;
    title: string;
    level: string;
    accountGroup: AccountGroup;
    parentCode: string | null;
    budgetClass: string | null;
    isContra: boolean;
  }[]
>('chart-of-accounts.json');
const CLIMATE_TYPOLOGY_CODES = loadData<CCETSeed[]>(
  'climate-typology-codes.json',
);
const SGLG_INDICATORS = loadData<SGLGSeed[]>('sglg-indicators.json');
const SDG_GOALS = loadData<SDGSeed[]>('sdg-goals.json');
const CIVIL_SOCIETY_ORGANIZATIONS = loadCity<CSOSeed[]>('csos.json', []);

// ─── Helpers ─────────────────────────────────────────────────────────────────

// The AIP reference code's level-of-government digit (DBM Budget Operations Manual): 1 province,
// 2 city, 3 municipality. Set on a new office only; Control Panel can change it.
const LGU_LEVEL =
  { province: 1, city: 2, municipality: 3 }[process.env.LGU_TYPE?.trim() ?? ''] ??
  2;

async function seedSuperAdmin() {
  // Lowercased for the same reason every auth DTO now normalizes email
  // (NormalizeEmail decorator) — User.email lookups are case-sensitive, so a
  // mixed-case .env value would seed a row that a normalized login could
  // never match.
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const firstName = process.env.SEED_ADMIN_FIRST_NAME ?? 'Super Admin';
  const lastName = process.env.SEED_ADMIN_LAST_NAME ?? 'User';

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in your .env',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`  SUPER_ADMIN already exists: ${email} — skipping.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 12);
  await prisma.user.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashed,
      role: 'SUPER_ADMIN',
      identityType: null,
      isEmailVerified: true,
      lastVerifiedAt: new Date(),
    },
  });

  console.log(`  SUPER_ADMIN created: ${email}`);
}

// ─── Permission catalog ──────────────────────────────────────────────────────

/**
 * Mirrors PERMISSION_CATALOG into the `permissions` table so a freshly seeded DB
 * can accept UserPermission grants before the API has ever booted.
 * `PermissionCatalogSyncService` performs the same upsert on every bootstrap —
 * this exists for the fresh-DB and CI paths.
 */
async function seedPermissions() {
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: {
        label: p.label,
        description: p.description,
        module: p.module,
        enforced: p.enforced ?? false,
        isActive: true,
      },
      create: {
        key: p.key,
        label: p.label,
        description: p.description,
        module: p.module,
        enforced: p.enforced ?? false,
        isActive: true,
      },
    });
  }
  console.log(`  ${PERMISSION_CATALOG.length} permission(s) upserted.`);
}

// ─── Thematic tags ───────────────────────────────────────────────────────────

async function seedThematicTags() {
  // Needs an existing user to attribute creation to — the SUPER_ADMIN seeded
  // just before this runs. Idempotent on `normalizedName` (FR-007), same as
  // every other reference-data upsert here.
  const admin = await prisma.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin) {
    console.log('  No SUPER_ADMIN found — skipping ThematicTag catalog seed.');
    return;
  }
  for (const name of THEMATIC_TAGS) {
    const normalizedName = name.trim().toLowerCase();
    await prisma.thematicTag.upsert({
      where: { normalizedName },
      update: { name },
      create: { name, normalizedName, createdByUserId: admin.id },
    });
  }
  console.log(`  ThematicTags seeded: ${THEMATIC_TAGS.length}`);
}

// ─── AIP reference data (PAP sectors, UACS, CCET, SGLG, SDG) ────────────────

async function seedAIPReferenceData() {
  // Idempotent upserts on `code`. Safe to re-run.
  for (const sector of PAP_SECTORS) {
    await prisma.pAPSector.upsert({
      where: { code: sector.code },
      update: { name: sector.name },
      create: { code: sector.code, name: sector.name },
    });
  }
  console.log(`  PAPSectors seeded: ${PAP_SECTORS.length}`);

  for (const obj of UACS_OBJECTS) {
    await prisma.uACSObject.upsert({
      where: { code: obj.code },
      update: { description: obj.description, expenseClass: obj.expenseClass },
      create: obj,
    });
  }
  console.log(`  UACSObjects seeded: ${UACS_OBJECTS.length}`);

  for (const code of CLIMATE_TYPOLOGY_CODES) {
    await prisma.climateTypologyCode.upsert({
      where: { code: code.code },
      update: {
        name: code.name,
        pillar: code.pillar,
        description: code.description,
        isActive: true,
      },
      create: code,
    });
  }
  // Codes no longer in the catalog (the original CCA_001… placeholders) are
  // deactivated, not deleted: existing tags may still point at them.
  const retired = await prisma.climateTypologyCode.updateMany({
    where: {
      code: { notIn: CLIMATE_TYPOLOGY_CODES.map((c) => c.code) },
      isActive: true,
    },
    data: { isActive: false },
  });
  console.log(
    `  ClimateTypologyCodes seeded: ${CLIMATE_TYPOLOGY_CODES.length} (${retired.count} retired)`,
  );

  for (const indicator of SGLG_INDICATORS) {
    await prisma.sGLGIndicator.upsert({
      where: { code: indicator.code },
      update: { name: indicator.name, pillar: indicator.pillar },
      create: { ...indicator, dilgYear: 2026 },
    });
  }
  console.log(`  SGLGIndicators seeded: ${SGLG_INDICATORS.length}`);

  for (const goal of SDG_GOALS) {
    await prisma.sDGGoal.upsert({
      where: { code: goal.code },
      update: { name: goal.name },
      create: goal,
    });
  }
  console.log(`  SDGGoals seeded: ${SDG_GOALS.length}`);
}

// ─── Offices ──────────────────────────────────────────────────────────────────

/**
 * `officeCode` and `officeType` are AIP code segments, so changing either makes
 * the tentative code of every PPA under that office stale.
 * `ReferenceService.updateOffice` resyncs automatically; this seed cannot — it
 * writes through `PrismaClient` directly and cannot reach `AIPCodesService`
 * (ts-node resolves the service's relative `.js` imports only under the app's
 * `nodenext` config). So it reports the exact remedy instead of silently
 * leaving derived state wrong.
 *
 * Only bites when the city reissues its coding sheet against a populated
 * database — a fresh seed has no programs, and a re-run with unchanged
 * `offices.json` changes no segment.
 *
 * ponytail: swap the warning for a real resync if this stops being rare.
 */
async function warnIfCodesWentStale(changedAcronyms: string[]) {
  if (changedAcronyms.length === 0) return;

  const affected = await prisma.program.count({
    where: {
      deletedAt: null,
      office: { acronym: { in: changedAcronyms } },
    },
  });
  console.log(
    `    Office code/type changed for: ${changedAcronyms.join(', ')}`,
  );
  if (affected === 0) return;

  console.log(
    `\n  !! ${affected} program(s) now carry a STALE tentative AIP reference code.\n` +
      `     The office code and type are code segments; the seed cannot resync them.\n` +
      `     Fix by reordering each affected scope through the API, which resyncs:\n` +
      `       PATCH /api/v1/programs/reorder  { "ids": [<every id in one cycle+office+papSector scope>] }\n` +
      `     Already-issued final codes are immutable and unaffected.\n`,
  );
}

/**
 * Reconcile `offices.json` (transcribed from the city's AIP coding sheet)
 * against what is already in the database.
 *
 * Matched by acronym and updated in place — never wiped — because offices carry
 * nine inbound foreign keys. Offices absent from the sheet keep their rows and
 * stay active; the seed only ever adds or updates.
 */
async function seedOffices(clusterIdByName: Map<string, string>) {
  // Requires seedAIPReferenceData() to have run — see the ordering note in main().
  const sectors = await prisma.pAPSector.findMany({
    select: { id: true, code: true },
  });
  const sectorIdByCode = new Map(sectors.map((s) => [s.code, s.id]));

  const existing = await prisma.office.findMany({
    select: {
      id: true,
      acronym: true,
      officeCode: true,
      officeType: true,
      form7Column: true,
    },
  });
  const byId = new Map(existing.map((o) => [o.id, o]));
  const idByAcronym = new Map(existing.map((o) => [o.acronym, o.id]));
  // Legacy acronym → the sheet acronym it became, so the old row is found.
  for (const [legacy, current] of Object.entries(RENAMED_ACRONYMS)) {
    const id = idByAcronym.get(legacy);
    if (id && !idByAcronym.has(current)) idByAcronym.set(current, id);
  }

  let created = 0;
  let updated = 0;
  const segmentChanged: string[] = [];
  const form7BySector: string[] = [];
  for (const office of OFFICES) {
    const clusterId = clusterIdByName.get(office.cluster);
    if (!clusterId) {
      throw new Error(
        `Office ${office.acronym} names cluster "${office.cluster}", which is not in clusters.json`,
      );
    }
    // Offices the coding sheet gives no sector are left null for an admin to set.
    let papSectorId: string | null = null;
    if (office.papSector) {
      papSectorId = sectorIdByCode.get(office.papSector) ?? null;
      if (!papSectorId) {
        throw new Error(
          `Office ${office.acronym} names PAP sector "${office.papSector}", which is not in pap-sectors.json`,
        );
      }
    }
    const data = {
      name: office.name,
      acronym: office.acronym,
      officeCode: office.code,
      officeType: office.officeType,
      clusterId,
      papSectorId,
      aipSectorGroup: office.aipSectorGroup ?? null,
    };
    // Form 7 settings are editable in Control Panel, so a reseed only fills a
    // blank column — it never undoes an edit.
    let form7Column: Form7ColumnSeed | undefined;
    if (office.isActive !== false) {
      form7Column =
        office.form7Column ??
        (office.papSector
          ? FORM7_COLUMN_BY_SECTOR[office.papSector]
          : undefined);
      if (!office.form7Column && form7Column) {
        form7BySector.push(`${office.acronym} → ${form7Column}`);
      }
    }
    const form7 = office.isActive === false ? { isActive: false } : {};
    const id = idByAcronym.get(office.acronym);
    if (id) {
      const before = byId.get(id);
      if (
        before &&
        (before.officeCode !== office.code ||
          before.officeType !== office.officeType)
      ) {
        segmentChanged.push(office.acronym);
      }
      // A blank sector on the sheet means "no default here", not "clear it" — an
      // admin may have set one in Control Panel since the last seed. Only the
      // sheet's own value overwrites.
      const { papSectorId: sheetSector, ...withoutSector } = data;
      await prisma.office.update({
        where: { id },
        data: {
          ...(sheetSector ? data : withoutSector),
          ...form7,
          ...(before?.form7Column == null && form7Column
            ? { form7Column }
            : {}),
        },
      });
      updated++;
    } else {
      await prisma.office.create({
        data: {
          ...data,
          ...form7,
          form7Column: form7Column ?? null,
          lguLevel: LGU_LEVEL,
        },
      });
      created++;
    }
  }
  console.log(`  Offices seeded: ${updated} updated, ${created} created`);
  if (form7BySector.length) {
    console.log(
      `    Form 7 column from PAP sector (no column set for the office — review): ${form7BySector.join(', ')}`,
    );
  }

  await warnIfCodesWentStale(segmentChanged);

  const seeded = new Set(OFFICES.map((o) => o.acronym));
  const untouched = existing
    .filter((o) => !seeded.has(o.acronym) && !(o.acronym in RENAMED_ACRONYMS))
    .map((o) => o.acronym);
  if (untouched.length) {
    console.log(
      `    Not in the coding sheet, left as-is: ${untouched.join(', ')}`,
    );
  }
}

// ─── Clusters, finish lines, city offices ─────────────────────────────────────

async function seedChartOfAccounts() {
  // Upsert on the printed code. `parentCode` is plain text, so order is free.
  for (const a of CHART_OF_ACCOUNTS) {
    const { code, ...data } = a;
    await prisma.chartAccount.upsert({
      where: { code },
      create: a,
      update: data,
    });
  }
}

async function seedReferenceData() {
  // Non-destructive: FinishLine, Cluster, and Office carry inbound FKs
  // (ceilings, programs, supporting-office links, memberships), so they must
  // NOT be wiped. Reconcile them in place and only rebuild FK-free join rows.
  await prisma.finishLineCluster.deleteMany();

  // Reconcile finish lines, keyed by vision number for fast lookup
  const finishLineMap = new Map<number, string>(); // visionNumber → id
  for (const fl of FINISH_LINES) {
    const existing = await prisma.finishLine.findFirst({
      where: { visionNumber: fl.visionNumber },
    });
    const record = existing
      ? await prisma.finishLine.update({
          where: { id: existing.id },
          data: {
            name: fl.name,
            fullName: fl.fullName,
            shortName: fl.shortName,
            color: fl.color,
          },
        })
      : await prisma.finishLine.create({
          data: {
            name: fl.name,
            fullName: fl.fullName,
            visionNumber: fl.visionNumber,
            shortName: fl.shortName,
            color: fl.color,
          },
        });
    finishLineMap.set(fl.visionNumber, record.id);
    console.log(`  Vision ${fl.visionNumber}: "${fl.name}"`);
  }

  console.log('');

  // Reconcile clusters and link them to finish lines; offices follow, keyed by
  // cluster name rather than nesting, since offices.json is now one flat list.
  const clusterIdByName = new Map<string, string>();
  for (const clusterDef of CLUSTERS) {
    const existingCluster = await prisma.cluster.findFirst({
      where: { name: clusterDef.name },
    });
    const cluster = existingCluster
      ? await prisma.cluster.update({
          where: { id: existingCluster.id },
          data: { fullName: clusterDef.fullName },
        })
      : await prisma.cluster.create({
          data: { name: clusterDef.name, fullName: clusterDef.fullName },
        });

    for (const vision of clusterDef.visions) {
      const finishLineId = finishLineMap.get(vision)!;
      await prisma.finishLineCluster.create({
        data: { finishLineId, clusterId: cluster.id },
      });
    }

    clusterIdByName.set(clusterDef.name, cluster.id);

    const visionLabels = clusterDef.visions.map((v) => `V${v}`).join(', ');
    console.log(`  Cluster "${clusterDef.name}" [${visionLabels}]`);
  }

  await seedOffices(clusterIdByName);
  await seedOfficeLineage();
}

/**
 * specs/018: an office keeps one line across years. `office-lineage.json`
 * (CPDO's map, `[{ "from": "<acronym>", "to": "<acronym>" }]`) points a
 * renamed or merged office at its surviving row. Absent file = nothing to do;
 * an unknown acronym is reported, never guessed.
 */
async function seedOfficeLineage() {
  const file = join(CITY_DIR, 'office-lineage.json');
  if (!existsSync(file)) return;
  const map = JSON.parse(readFileSync(file, 'utf-8')) as {
    from: string;
    to: string;
  }[];
  const offices = await prisma.office.findMany({
    select: { id: true, acronym: true },
  });
  const idOf = new Map(offices.map((o) => [o.acronym, o.id]));
  for (const { from, to } of map) {
    const fromId = idOf.get(from);
    const toId = idOf.get(to);
    if (!fromId || !toId) {
      console.warn(
        `  office-lineage: unknown acronym in ${from} → ${to}; skipped`,
      );
      continue;
    }
    await prisma.office.update({
      where: { id: fromId },
      data: { lineageId: toId },
    });
    console.log(`  Office ${from} continues as ${to}`);
  }
}

// ─── Civil Society Organizations ───────────────────────────────

async function seedCivilSocietyOrganizations() {
  const clusters = await prisma.cluster.findMany();
  const clusterByName = new Map(clusters.map((c) => [c.name, c.id]));

  for (const cso of CIVIL_SOCIETY_ORGANIZATIONS) {
    const clusterId = clusterByName.get(cso.clusterName);
    if (!clusterId) {
      console.warn(
        `  WARNING: cluster "${cso.clusterName}" not found — skipping ${cso.name}`,
      );
      continue;
    }
    await prisma.civilSocietyOrganization.upsert({
      where: { code: cso.code },
      update: { name: cso.name, clusterId },
      create: { code: cso.code, name: cso.name, clusterId },
    });
  }
  console.log(
    `  CivilSocietyOrganizations seeded: ${CIVIL_SOCIETY_ORGANIZATIONS.length}`,
  );
}

// ─── Committees (Local Finance Committee) ─────────────────────────────────────
// The LFC is the standing AIP approving body; its member offices each cast an
// APPROVED/REJECTED decision on every endorsed program. Membership is data,
// not a boolean on Office, so adding committees later (IPC, BAC, ...) is
// a data change rather than a schema migration.
const LFC_MEMBER_ACRONYMS = ['CPDO', 'CBO', 'CTO', 'CMO'] as const;

async function seedCommittees() {
  const lfc = await prisma.committee.upsert({
    where: { code: 'LFC' },
    update: { name: 'Local Finance Committee' },
    create: { code: 'LFC', name: 'Local Finance Committee' },
  });

  const offices = await prisma.office.findMany({
    where: { acronym: { in: [...LFC_MEMBER_ACRONYMS] } },
    select: { id: true, acronym: true },
  });
  if (offices.length === 0) {
    console.warn(
      `  WARNING: none of [${LFC_MEMBER_ACRONYMS.join(', ')}] found — LFC has no members.`,
    );
    return;
  }

  // Re-seat memberships idempotently — clear this committee's roster and
  // recreate from the current office set so reruns reflect any acronym changes.
  await prisma.committeeMembership.deleteMany({
    where: { committeeId: lfc.id },
  });
  const officeByAcronym = new Map(offices.map((o) => [o.acronym, o]));
  await prisma.committeeMembership.createMany({
    data: LFC_MEMBER_ACRONYMS.flatMap((acronym, index) => {
      const office = officeByAcronym.get(acronym);
      return office
        ? [
            {
              committeeId: lfc.id,
              officeId: office.id,
              sequenceOrder: index + 1,
            },
          ]
        : [];
    }),
  });

  const orderedAcronyms = LFC_MEMBER_ACRONYMS.filter((acronym) =>
    officeByAcronym.has(acronym),
  );
  console.log(
    `  Committee "LFC" → ${orderedAcronyms.length} member office(s): ${orderedAcronyms.join(', ')}`,
  );
}

// ─── Sub-finish lines ─────────────────────────────────────────────────────────

async function seedSubFinishLines() {
  if (SUB_FINISH_LINES.length === 0) return;
  const finishLines = await prisma.finishLine.findMany();
  const byVision = new Map(finishLines.map((fl) => [fl.visionNumber, fl.id]));
  for (const sfl of SUB_FINISH_LINES) {
    const finishLineId = byVision.get(sfl.finishLineVisionNumber);
    if (!finishLineId) {
      console.warn(
        `  Sub-finish line "${sfl.code}" skipped: vision ${sfl.finishLineVisionNumber} not found`,
      );
      continue;
    }
    await prisma.subFinishLine.upsert({
      where: { code: sfl.code },
      update: { name: sfl.name, finishLineId },
      create: { code: sfl.code, name: sfl.name, finishLineId },
    });
  }
  console.log(`  SubFinishLines seeded: ${SUB_FINISH_LINES.length}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding super admin...');
  await seedSuperAdmin();

  console.log('Seeding permission catalog...');
  await seedPermissions();

  console.log('Seeding thematic tags...');
  await seedThematicTags();

  // AIP reference data first: offices carry a `papSectorId`, so the PAP sectors
  // have to exist before `seedOffices` can resolve a sector code to an id.
  // Nothing in here depends on clusters or offices.
  console.log(
    'Seeding AIP reference data (PAP sectors, UACS, CCET, SGLG, SDG)...',
  );
  await seedAIPReferenceData();

  console.log('Seeding the LGU chart of accounts...');
  await seedChartOfAccounts();

  console.log('Seeding reference data (clusters, finish lines, offices)...');
  await seedReferenceData();

  console.log('Seeding sub-finish lines...');
  await seedSubFinishLines();

  console.log('Seeding civil society organizations...');
  await seedCivilSocietyOrganizations();

  console.log('Seeding committees (Local Finance Committee)...');
  await seedCommittees();

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
