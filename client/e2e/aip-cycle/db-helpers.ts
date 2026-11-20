import { createRequire } from 'node:module';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { PrismaClient } from '../../../api/src/generated/prisma/index.js';
import type { SqlDriverAdapterFactory } from '../../../api/src/generated/prisma/runtime/client.js';
import { ensureArtifactDirs, getArtifactRoot, getRunId } from './artifacts';

type PrismaPgConstructor = new (options: {
  connectionString: string | undefined;
}) => SqlDriverAdapterFactory;

const requireFromApi = createRequire(
  path.resolve(process.cwd(), '../api/package.json'),
);
const { config: loadDotenv } = requireFromApi('dotenv') as {
  config: (options: { path: string; quiet?: boolean }) => void;
};
const { PrismaPg } = requireFromApi('@prisma/adapter-pg') as {
  PrismaPg: PrismaPgConstructor;
};

export function createPrismaClient() {
  loadApiEnv();
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });
}

export function loadApiEnv() {
  loadDotenv({ path: path.resolve(process.cwd(), '../api/.env'), quiet: true });
}

export async function snapshotPsoCeppioPrograms() {
  assertDestructiveEnabled();
  await ensureArtifactDirs();

  const prisma = createPrismaClient();
  try {
    const programs = await prisma.program.findMany({
      where: {
        deletedAt: null,
        cityOffice: {
          acronym: {
            in: ['PSO', 'CEPPIO'],
          },
        },
      },
      orderBy: [
        { cityOffice: { acronym: 'asc' } },
        { aipCycle: { fiscalYear: 'asc' } },
        { createdAt: 'asc' },
      ],
      include: {
        aipCycle: true,
        cityOffice: {
          select: {
            id: true,
            name: true,
            acronym: true,
          },
        },
        projectActivities: {
          include: {
            lineItems: true,
            climateChangeTag: true,
          },
        },
        versions: true,
        verdicts: true,
        endorsements: true,
        approvals: true,
        comments: true,
        readStates: true,
        supportingOffices: true,
      },
    });

    const snapshot = {
      exportedAt: new Date().toISOString(),
      count: programs.length,
      programs,
    };
    const path = `${getArtifactRoot()}/pre-reset.json`;
    const runPath = `${getArtifactRoot()}/snapshots/${getRunId()}-pre-reset.json`;
    await writeFile(
      path,
      `${JSON.stringify(snapshot, null, 2)}\n`,
    );
    await writeFile(runPath, `${JSON.stringify(snapshot, null, 2)}\n`);

    return {
      path,
      runPath,
      count: programs.length,
    };
  } finally {
    await prisma.$disconnect();
  }
}

export async function resetAipCycleData() {
  assertDestructiveEnabled();

  const prisma = createPrismaClient();
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const testInvites = await tx.userInvite.deleteMany({
        where: { email: { startsWith: 'aip-e2e+' } },
      });
      const testUsers = await tx.user.deleteMany({
        where: { email: { startsWith: 'aip-e2e+' } },
      });
      const programComments = await tx.programComment.deleteMany({});
      const publicRegistryFeedback = await tx.publicRegistryFeedback.deleteMany({});
      const programReadStates = await tx.programReadState.deleteMany({});
      const programApprovals = await tx.programApproval.deleteMany({});
      const programEndorsements = await tx.programEndorsement.deleteMany({});
      const programVerdicts = await tx.programVerdict.deleteMany({});
      const programVersions = await tx.programVersion.deleteMany({});
      // Batches are referenced by versions/approvals (SetNull); delete after them.
      const programApprovalBatches =
        await tx.programApprovalBatch.deleteMany({});
      const climateChangeTags = await tx.climateChangeTag.deleteMany({});
      const lineItems = await tx.lineItem.deleteMany({});
      const projectActivities = await tx.projectActivity.deleteMany({});
      const programSupportingOffices = await tx.programSupportingOffice.deleteMany({});
      const programs = await tx.program.deleteMany({});
      const testCsos = await tx.civilSocietyOrganization.deleteMany({
        where: { name: { startsWith: 'AIP E2E ' } },
      });
      const testEndorserOffices = await tx.cityOffice.deleteMany({
        where: { acronym: { startsWith: 'AIP-E2E-' } },
      });
      const aipExportLogs = await tx.aIPExportLog.deleteMany({});
      const ceilingHistory = await tx.finishLineBudgetCeilingHistory.deleteMany({});
      const ceilings = await tx.finishLineBudgetCeiling.deleteMany({});
      const aipCodeCounters = await tx.aIPCodeCounter.deleteMany({});
      const aipCycles = await tx.aIPCycle.deleteMany({});

      return {
        programComments: programComments.count,
        testInvites: testInvites.count,
        testUsers: testUsers.count,
        publicRegistryFeedback: publicRegistryFeedback.count,
        programReadStates: programReadStates.count,
        programApprovals: programApprovals.count,
        programEndorsements: programEndorsements.count,
        programVerdicts: programVerdicts.count,
        programVersions: programVersions.count,
        programApprovalBatches: programApprovalBatches.count,
        climateChangeTags: climateChangeTags.count,
        lineItems: lineItems.count,
        projectActivities: projectActivities.count,
        programSupportingOffices: programSupportingOffices.count,
        programs: programs.count,
        testCsos: testCsos.count,
        testEndorserOffices: testEndorserOffices.count,
        aipExportLogs: aipExportLogs.count,
        ceilingHistory: ceilingHistory.count,
        ceilings: ceilings.count,
        aipCodeCounters: aipCodeCounters.count,
        aipCycles: aipCycles.count,
      };
    });

    return deleted;
  } finally {
    await prisma.$disconnect();
  }
}

function assertDestructiveEnabled() {
  if (process.env.AIP_DESTRUCTIVE_E2E !== '1') {
    throw new Error('Refusing DB mutation without AIP_DESTRUCTIVE_E2E=1.');
  }
}
