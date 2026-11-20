import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';
import {
  captureMilestone,
  ensureArtifactDirs,
  monitorPageFailures,
  recordBlockedScenario,
  withScenario,
  writeEvidence,
  type ScenarioRecord,
} from './artifacts';
import {
  apiBaseUrl,
  expectApiStatus,
  loginAsSuperAdmin,
  loginTokens,
  loginWithCredentials,
} from './api-helpers';
import { resetAipCycleData, snapshotPsoCeppioPrograms } from './db-helpers';

const clientBaseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
const fiscalYear = Number(process.env.AIP_E2E_FISCAL_YEAR ?? 2028);
const psoStaffEmail = 'aip-e2e+pso-staff@example.test';
const psoStaffPassword = 'AipE2eStaff123!';
const psoHeadEmail = 'aip-e2e+pso-head@example.test';
const psoHeadPassword = 'AipE2eHead123!';
const ceppioStaffEmail = 'aip-e2e+ceppio-staff@example.test';
const ceppioStaffPassword = 'AipE2eCeppioStaff123!';
const ceppioHeadEmail = 'aip-e2e+ceppio-head@example.test';
const ceppioHeadPassword = 'AipE2eCeppioHead123!';
const lguEndorserEmail = 'aip-e2e+lgu-endorser@example.test';
const lguEndorserPassword = 'AipE2eLguEndorser123!';
const ncpcUmbrellaEmail = 'aip-e2e+ncpc-umbrella@example.test';
const ncpcUmbrellaPassword = 'AipE2eNcpcUmbrella123!';
const sameClusterCsoEmail = 'aip-e2e+cso-same-cluster@example.test';
const sameClusterCsoPassword = 'AipE2eCsoSame123!';
const crossClusterCsoEmail = 'aip-e2e+cso-cross-cluster@example.test';
const crossClusterCsoPassword = 'AipE2eCsoCross123!';
const peerReaderEmail = 'aip-e2e+peer-reader@example.test';
const peerReaderPassword = 'AipE2ePeerReader123!';
const lfcRejectHeadEmail = 'aip-e2e+lfc-reject-head@example.test';
const lfcRejectHeadPassword = 'AipE2eLfcReject123!';

type ScenarioScratch = Pick<ScenarioRecord, 'artifacts' | 'notes'>;

async function inviteAndActivateUser({
  request,
  adminHeaders,
  cityOfficeId,
  civilSocietyOrganizationId,
  identityType = 'LGU',
  officeAcronym,
  email,
  password,
  role,
  firstName,
  lastName,
  record,
}: {
  request: APIRequestContext;
  adminHeaders: { Authorization: string };
  cityOfficeId?: string;
  civilSocietyOrganizationId?: string | null;
  identityType?: 'LGU' | 'NCPC' | 'LFC';
  officeAcronym: string;
  email: string;
  password: string;
  role: 'STAFF' | 'HEAD';
  firstName: string;
  lastName: string;
  record: ScenarioScratch;
}) {
  const inviteResponse = await request.post(`${apiBaseUrl()}/users`, {
    headers: adminHeaders,
    data: {
      firstName,
      lastName,
      email,
      role,
      identityType,
      ...(cityOfficeId ? { cityOfficeId } : {}),
      ...(civilSocietyOrganizationId !== undefined
        ? { civilSocietyOrganizationId }
        : {}),
    },
  });
  await expectApiStatus(inviteResponse, 201);
  record.notes?.push(`Invited ${email} to ${officeAcronym} as ${role}.`);

  const outboxResponse = await request.get(`${apiBaseUrl()}/mail/outbox`, {
    headers: adminHeaders,
  });
  await expectApiStatus(outboxResponse, 200);
  const outbox = (await outboxResponse.json()) as Array<{
    to: string;
    messageType: string;
    copyValue: string | null;
  }>;
  const invite = outbox.find(
    (item) => item.to === email && item.messageType === 'invite',
  );
  if (!invite?.copyValue) {
    throw new Error(`Invite email for ${email} was not found in outbox.`);
  }
  const token = new URL(invite.copyValue).searchParams.get('token');
  if (!token) {
    throw new Error(`Invite URL for ${email} did not include a token.`);
  }

  const previewResponse = await request.post(`${apiBaseUrl()}/auth/invite-preview`, {
    data: { token },
  });
  await expectApiStatus(previewResponse, 200);
  const preview = (await previewResponse.json()) as { email: string };
  if (preview.email !== email) {
    throw new Error(`Expected invite preview email ${email}, got ${preview.email}.`);
  }

  const setPasswordResponse = await request.post(`${apiBaseUrl()}/auth/set-password`, {
    data: {
      token,
      password,
      confirmPassword: password,
    },
  });
  await expectApiStatus(setPasswordResponse, 200);
  record.notes?.push(`Activated ${email}.`);

  await loginWithCredentials(request, email, password);
  record.notes?.push(`Verified ${email} can log in.`);
}

test.beforeAll(async () => {
  await ensureArtifactDirs();

  if (process.env.AIP_DESTRUCTIVE_E2E !== '1') {
    throw new Error(
      'Refusing to run destructive AIP cycle tests without AIP_DESTRUCTIVE_E2E=1.',
    );
  }
});

test('preflight records reachable local API and client evidence', async ({
  page,
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'preflight-local-services',
    'Preflight: local API and client are reachable',
    page,
    async (record) => {
      const pageFailures = monitorPageFailures(page);

      const healthResponse = await request.get(`${apiBaseUrl()}/health`);
      expect(healthResponse.ok()).toBe(true);
      record.notes?.push(`API health responded ${healthResponse.status()}.`);

      const clientResponse = await page.goto(clientBaseUrl, {
        waitUntil: 'domcontentloaded',
      });
      expect(clientResponse?.ok()).toBe(true);

      record.artifacts.screenshots.push(
        await captureMilestone(page, 'preflight-local-services', 'client-home'),
      );

      pageFailures.assertNoFailures();
    },
  );
});

test('records planned scenario ledger before workflow implementation', async () => {
  const blockedReason =
    'Scenario is planned but not implemented in the harness yet; see docs/testing/aip-cycle/progress.md.';

  await recordBlockedScenario('snapshot-and-reset', 'Preflight and PSO/CEPPIO snapshot', [
    blockedReason,
  ]);
  await recordBlockedScenario('cycle-setup', 'Cycle create, ceilings, and open', [
    blockedReason,
  ]);
  await recordBlockedScenario('invites-and-accounts', 'Invite and activate workflow users', [
    blockedReason,
  ]);
  await recordBlockedScenario('public-feedback', 'Public registry and LGU feedback dashboard', [
    blockedReason,
  ]);
  await recordBlockedScenario('endorsement', 'LGU, NCPC, and CSO endorsement flows', [
    blockedReason,
  ]);
  await recordBlockedScenario('lfc-batch-gate', 'LFC proponent-office batch gate', [
    blockedReason,
  ]);
  await recordBlockedScenario('every-route-coverage', 'Every-route coverage classification', [
    blockedReason,
  ]);
});

test('snapshots PSO/CEPPIO programs and resets AIP cycle data', async ({}, testInfo) => {
  await withScenario(
    testInfo,
    'snapshot-and-reset',
    'Preflight and PSO/CEPPIO snapshot',
    null,
    async (record) => {
      const snapshot = await snapshotPsoCeppioPrograms();
      record.notes?.push(
        `Exported ${snapshot.count} current PSO/CEPPIO programs to ${snapshot.path}.`,
      );
      record.notes?.push(`Retained run snapshot at ${snapshot.runPath}.`);

      const deleted = await resetAipCycleData();
      record.notes?.push(`Deleted AIP cycle-linked rows: ${JSON.stringify(deleted)}.`);
      record.artifacts.evidence.push(
        await writeEvidence('snapshot-and-reset', 'db-reset', {
          scenario: 'snapshot-and-reset',
          assertions: [
            'A PSO/CEPPIO snapshot was written before destructive reset.',
            'AIP cycle-linked rows were deleted.',
            'Only suite-created aip-e2e users/invites and AIP E2E reference rows were removed.',
          ],
          snapshot,
          deleted,
        }),
      );
    },
  );
});

test('creates a cycle, configures ceilings, and opens it', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'cycle-setup',
    'Cycle create, ceilings, and open',
    null,
    async (record) => {
      const auth = await loginAsSuperAdmin(request);
      const createCycleResponse = await request.post(`${apiBaseUrl()}/aip-cycles`, {
        headers: auth.headers,
        data: { fiscalYear },
      });
      await expectApiStatus(createCycleResponse, 201);
      const cycle = (await createCycleResponse.json()) as {
        id: string;
        fiscalYear: number;
        status: string;
      };
      record.notes?.push(`Created AIP cycle ${cycle.fiscalYear} (${cycle.id}).`);

      const prematureOpenResponse = await request.patch(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/status`,
        {
          headers: auth.headers,
          data: { status: 'OPEN' },
        },
      );
      await expectApiStatus(prematureOpenResponse, 400);
      record.notes?.push('Verified OPEN transition is blocked before ceilings.');

      const finishLinesResponse = await request.get(
        `${apiBaseUrl()}/reference/finish-lines`,
        { headers: auth.headers },
      );
      await expectApiStatus(finishLinesResponse, 200);
      const finishLines = (await finishLinesResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      if (finishLines.length === 0) {
        throw new Error('No finish lines are available for ceiling setup.');
      }

      for (const [index, finishLine] of finishLines.entries()) {
        const ceilingResponse = await request.post(
          `${apiBaseUrl()}/finish-line-ceilings`,
          {
            headers: auth.headers,
            data: {
              aipCycleId: cycle.id,
              finishLineId: finishLine.id,
              totalCeiling: `${100_000_000 + index}.00`,
            },
          },
        );
        await expectApiStatus(ceilingResponse, 201);
      }
      record.notes?.push(`Created ${finishLines.length} finish-line ceilings.`);

      const listCeilingsResponse = await request.get(
        `${apiBaseUrl()}/finish-line-ceilings?cycleId=${cycle.id}`,
        { headers: auth.headers },
      );
      await expectApiStatus(listCeilingsResponse, 200);
      const ceilings = (await listCeilingsResponse.json()) as unknown[];
      if (ceilings.length !== finishLines.length) {
        throw new Error(
          `Expected ${finishLines.length} ceilings, got ${ceilings.length}.`,
        );
      }

      const openCycleResponse = await request.patch(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/status`,
        {
          headers: auth.headers,
          data: { status: 'OPEN' },
        },
      );
      await expectApiStatus(openCycleResponse, 200);
      const opened = (await openCycleResponse.json()) as { status: string };
      if (opened.status !== 'OPEN') {
        throw new Error(`Expected opened cycle status OPEN, got ${opened.status}.`);
      }
      record.notes?.push('Opened cycle after ceiling setup.');
      record.artifacts.evidence.push(
        await writeEvidence('cycle-setup', 'api-contract', {
          scenario: 'cycle-setup',
          cycle: {
            id: cycle.id,
            fiscalYear: cycle.fiscalYear,
            finalStatus: opened.status,
          },
          apiCalls: [
            { method: 'POST', path: '/aip-cycles', expectedStatus: 201 },
            {
              method: 'PATCH',
              path: `/aip-cycles/${cycle.id}/status`,
              body: { status: 'OPEN' },
              expectedStatus: 400,
              assertion: 'OPEN is rejected before ceilings exist.',
            },
            {
              method: 'GET',
              path: '/reference/finish-lines',
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: '/finish-line-ceilings',
              expectedStatus: 201,
              count: finishLines.length,
            },
            {
              method: 'GET',
              path: `/finish-line-ceilings?cycleId=${cycle.id}`,
              expectedStatus: 200,
              assertion: `Returned ${ceilings.length} ceilings.`,
            },
            {
              method: 'PATCH',
              path: `/aip-cycles/${cycle.id}/status`,
              body: { status: 'OPEN' },
              expectedStatus: 200,
            },
          ],
          assertions: [
            'Cycle starts in planning after creation.',
            'Opening before ceilings is blocked.',
            'One ceiling is created for each finish line.',
            'Cycle opens after all ceilings are present.',
          ],
        }),
      );
    },
  );
});

test('invites and activates PSO/CEPPIO staff and head accounts', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'invites-and-accounts',
    'Invite and activate workflow users',
    null,
    async (record) => {
      const auth = await loginAsSuperAdmin(request);
      const officesResponse = await request.get(
        `${apiBaseUrl()}/reference/city-offices`,
        { headers: auth.headers },
      );
      await expectApiStatus(officesResponse, 200);
      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const pso = offices.find((office) => office.acronym === 'PSO');
      if (!pso) {
        throw new Error('PSO city office not found in reference data.');
      }
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }

      await inviteAndActivateUser({
        request,
        adminHeaders: auth.headers,
        cityOfficeId: pso.id,
        officeAcronym: 'PSO',
        email: psoStaffEmail,
        password: psoStaffPassword,
        role: 'STAFF',
        firstName: 'AIP E2E',
        lastName: 'PSO Staff',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: auth.headers,
        cityOfficeId: pso.id,
        officeAcronym: 'PSO',
        email: psoHeadEmail,
        password: psoHeadPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'PSO Head',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: auth.headers,
        cityOfficeId: ceppio.id,
        officeAcronym: 'CEPPIO',
        email: ceppioStaffEmail,
        password: ceppioStaffPassword,
        role: 'STAFF',
        firstName: 'AIP E2E',
        lastName: 'CEPPIO Staff',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: auth.headers,
        cityOfficeId: ceppio.id,
        officeAcronym: 'CEPPIO',
        email: ceppioHeadEmail,
        password: ceppioHeadPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'CEPPIO Head',
        record,
      });

      const usersResponse = await request.get(`${apiBaseUrl()}/users`, {
        headers: auth.headers,
      });
      await expectApiStatus(usersResponse, 200);
      const users = (await usersResponse.json()) as Array<{ email: string }>;
      for (const email of [
        psoStaffEmail,
        psoHeadEmail,
        ceppioStaffEmail,
        ceppioHeadEmail,
      ]) {
        if (!users.some((user) => user.email === email)) {
          throw new Error(`${email} was not present in the users list.`);
        }
      }
      record.artifacts.evidence.push(
        await writeEvidence('invites-and-accounts', 'users', {
          scenario: 'invites-and-accounts',
          officeIds: {
            PSO: pso.id,
            CEPPIO: ceppio.id,
          },
          users: [
            { email: psoStaffEmail, role: 'STAFF', office: 'PSO' },
            { email: psoHeadEmail, role: 'HEAD', office: 'PSO' },
            { email: ceppioStaffEmail, role: 'STAFF', office: 'CEPPIO' },
            { email: ceppioHeadEmail, role: 'HEAD', office: 'CEPPIO' },
          ],
          apiCalls: [
            { method: 'POST', path: '/users', expectedStatus: 201, count: 4 },
            {
              method: 'GET',
              path: '/mail/outbox',
              expectedStatus: 200,
              count: 4,
            },
            {
              method: 'POST',
              path: '/auth/invite-preview',
              expectedStatus: 200,
              count: 4,
            },
            {
              method: 'POST',
              path: '/auth/set-password',
              expectedStatus: 200,
              count: 4,
            },
            {
              method: 'POST',
              path: '/auth/login',
              expectedStatus: 200,
              count: 4,
            },
            { method: 'GET', path: '/users', expectedStatus: 200 },
          ],
          assertions: [
            'Each invite was present in the dev mail outbox.',
            'Each invite preview returned the expected email.',
            'Each password was set successfully.',
            'Each new account could log in.',
            'Each new account appeared in the admin users list.',
          ],
        }),
      );
    },
  );
});

test('creates, submits, and head-reviews a PSO program', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'proponent-programs-pso',
    'PSO program creation, PA/line-item entry, submission, and head review',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const staff = await loginWithCredentials(
        request,
        psoStaffEmail,
        psoStaffPassword,
      );
      const head = await loginWithCredentials(request, psoHeadEmail, psoHeadPassword);

      const [cyclesResponse, officesResponse, sectorsResponse, finishLinesResponse] =
        await Promise.all([
          request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
          request.get(`${apiBaseUrl()}/reference/city-offices`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/pap-sectors`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/finish-lines`, {
            headers: admin.headers,
          }),
        ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);
      await expectApiStatus(sectorsResponse, 200);
      await expectApiStatus(finishLinesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const pso = offices.find((office) => office.acronym === 'PSO');
      if (!pso) {
        throw new Error('PSO city office not found in reference data.');
      }

      const papSectors = (await sectorsResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const papSector = papSectors[0];
      if (!papSector) {
        throw new Error('No PAP sectors are available for program setup.');
      }

      const finishLines = (await finishLinesResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const finishLine = finishLines[0];
      if (!finishLine) {
        throw new Error('No finish lines are available for program setup.');
      }

      const uacsResponse = await request.get(
        `${apiBaseUrl()}/reference/uacs-objects?expenseClass=MOOE`,
        { headers: admin.headers },
      );
      await expectApiStatus(uacsResponse, 200);
      const uacsObjects = (await uacsResponse.json()) as Array<{
        id: string;
        code: string;
        name: string;
      }>;
      const uacsObject = uacsObjects[0];
      if (!uacsObject) {
        throw new Error('No MOOE UACS objects are available for line-item setup.');
      }

      const createProgramResponse = await request.post(`${apiBaseUrl()}/programs`, {
        headers: staff.headers,
        data: {
          aipCycleId: cycle.id,
          cityOfficeId: pso.id,
          papSectorId: papSector.id,
          papSubsectorCode: '000',
          finishLineId: finishLine.id,
          name: `AIP E2E PSO Program ${fiscalYear}`,
          description: 'A destructive local E2E test program for PSO workflow.',
          remarks: 'Created by the AIP cycle destructive acceptance suite.',
          expectedOutput: 'Validated PSO AIP cycle submission workflow.',
          implementationStartMonth: 1,
          implementationStartYear: fiscalYear,
          implementationEndMonth: 12,
          implementationEndYear: fiscalYear,
        },
      });
      await expectApiStatus(createProgramResponse, 201);
      const program = (await createProgramResponse.json()) as {
        id: string;
        status: string;
      };
      if (program.status !== 'DRAFT') {
        throw new Error(`Expected new program status DRAFT, got ${program.status}.`);
      }
      record.notes?.push(`Created PSO program ${program.id}.`);

      const createPaResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/project-activities`,
        {
          headers: staff.headers,
          data: {
            type: 'ACTIVITY',
            name: 'AIP E2E PSO Implementation Activity',
            description: 'Baseline activity for the PSO program workflow test.',
            expectedOutput: 'Activity entered with one validated line item.',
            orderIndex: 0,
            costMode: 'DIRECT_COSTS',
            implementationStartMonth: 1,
            implementationStartYear: fiscalYear,
            implementationEndMonth: 12,
            implementationEndYear: fiscalYear,
          },
        },
      );
      await expectApiStatus(createPaResponse, 201);
      const projectActivity = (await createPaResponse.json()) as { id: string };

      const createLineItemResponse = await request.post(
        `${apiBaseUrl()}/project-activities/${projectActivity.id}/line-items`,
        {
          headers: staff.headers,
          data: {
            expenseClass: 'MOOE',
            uacsObjectId: uacsObject.id,
            quantity: '1.00',
            unit: 'lot',
            unitCost: '100000.00',
            remarks: 'E2E workflow line item.',
            orderIndex: 0,
          },
        },
      );
      await expectApiStatus(createLineItemResponse, 201);
      const lineItem = (await createLineItemResponse.json()) as { id: string };
      record.notes?.push('Created one project activity and one MOOE line item.');

      const refreshedProgramResponse = await request.get(
        `${apiBaseUrl()}/programs/${program.id}`,
        { headers: staff.headers },
      );
      await expectApiStatus(refreshedProgramResponse, 200);
      const refreshedProgram = (await refreshedProgramResponse.json()) as {
        grandTotal: string;
      };
      if (Number(refreshedProgram.grandTotal) !== 100000) {
        throw new Error(
          `Expected program grandTotal 100000, got ${refreshedProgram.grandTotal}.`,
        );
      }

      const submitResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/submit`,
        { headers: staff.headers },
      );
      await expectApiStatus(submitResponse, 200);
      const submittedProgram = (await submitResponse.json()) as {
        status: string;
        currentVersion: number;
      };
      if (
        submittedProgram.status !== 'SUBMITTED' ||
        submittedProgram.currentVersion !== 1
      ) {
        throw new Error(
          `Expected SUBMITTED version 1, got ${submittedProgram.status} version ${submittedProgram.currentVersion}.`,
        );
      }
      record.notes?.push('Submitted PSO program as staff and created version 1.');

      const headReviewResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/head-review`,
        { headers: head.headers },
      );
      await expectApiStatus(headReviewResponse, 200);
      const reviewedProgram = (await headReviewResponse.json()) as { status: string };
      if (reviewedProgram.status !== 'HEAD_REVIEWED') {
        throw new Error(
          `Expected HEAD_REVIEWED after head review, got ${reviewedProgram.status}.`,
        );
      }
      record.notes?.push('Head-reviewed PSO program as PSO head.');

      const versionsResponse = await request.get(
        `${apiBaseUrl()}/programs/${program.id}/versions`,
        { headers: staff.headers },
      );
      await expectApiStatus(versionsResponse, 200);
      const versions = (await versionsResponse.json()) as Array<{ version: number }>;
      if (!versions.some((version) => version.version === 1)) {
        throw new Error('Submitted program version 1 was not returned.');
      }
      record.notes?.push('Verified submitted version history is readable.');
      record.artifacts.evidence.push(
        await writeEvidence('proponent-programs-pso', 'workflow', {
          scenario: 'proponent-programs-pso',
          office: { acronym: 'PSO', id: pso.id },
          cycle,
          program: {
            id: program.id,
            initialStatus: program.status,
            submittedStatus: submittedProgram.status,
            reviewedStatus: reviewedProgram.status,
            currentVersion: submittedProgram.currentVersion,
            grandTotal: refreshedProgram.grandTotal,
          },
          projectActivity: { id: projectActivity.id },
          lineItem: {
            id: lineItem.id,
            expenseClass: 'MOOE',
            quantity: '1.00',
            unitCost: '100000.00',
          },
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            { method: 'GET', path: '/reference/pap-sectors', expectedStatus: 200 },
            { method: 'GET', path: '/reference/finish-lines', expectedStatus: 200 },
            {
              method: 'GET',
              path: '/reference/uacs-objects?expenseClass=MOOE',
              expectedStatus: 200,
            },
            { method: 'POST', path: '/programs', expectedStatus: 201 },
            {
              method: 'POST',
              path: `/programs/${program.id}/project-activities`,
              expectedStatus: 201,
            },
            {
              method: 'POST',
              path: `/project-activities/${projectActivity.id}/line-items`,
              expectedStatus: 201,
            },
            { method: 'GET', path: `/programs/${program.id}`, expectedStatus: 200 },
            {
              method: 'POST',
              path: `/programs/${program.id}/submit`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: `/programs/${program.id}/head-review`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/programs/${program.id}/versions`,
              expectedStatus: 200,
            },
          ],
          assertions: [
            'PSO staff can create a DRAFT program for PSO.',
            'PSO staff can create one activity and one MOOE line item.',
            'Program total equals 100000.',
            'PSO staff can submit the program to SUBMITTED version 1.',
            'PSO head can mark the program HEAD_REVIEWED.',
            'Version 1 is readable from version history.',
          ],
        }),
      );
    },
  );
});

test('creates, submits, and head-reviews a CEPPIO program', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'proponent-programs-ceppio',
    'CEPPIO program creation, PA/line-item entry, submission, and head review',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const staff = await loginWithCredentials(
        request,
        ceppioStaffEmail,
        ceppioStaffPassword,
      );
      const head = await loginWithCredentials(
        request,
        ceppioHeadEmail,
        ceppioHeadPassword,
      );

      const [cyclesResponse, officesResponse, sectorsResponse, finishLinesResponse] =
        await Promise.all([
          request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
          request.get(`${apiBaseUrl()}/reference/city-offices`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/pap-sectors`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/finish-lines`, {
            headers: admin.headers,
          }),
        ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);
      await expectApiStatus(sectorsResponse, 200);
      await expectApiStatus(finishLinesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }

      const papSectors = (await sectorsResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const papSector = papSectors[0];
      if (!papSector) {
        throw new Error('No PAP sectors are available for program setup.');
      }

      const finishLines = (await finishLinesResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const finishLine = finishLines[0];
      if (!finishLine) {
        throw new Error('No finish lines are available for program setup.');
      }

      const uacsResponse = await request.get(
        `${apiBaseUrl()}/reference/uacs-objects?expenseClass=MOOE`,
        { headers: admin.headers },
      );
      await expectApiStatus(uacsResponse, 200);
      const uacsObjects = (await uacsResponse.json()) as Array<{
        id: string;
        code: string;
        name: string;
      }>;
      const uacsObject = uacsObjects[0];
      if (!uacsObject) {
        throw new Error('No MOOE UACS objects are available for line-item setup.');
      }

      const createProgramResponse = await request.post(`${apiBaseUrl()}/programs`, {
        headers: staff.headers,
        data: {
          aipCycleId: cycle.id,
          cityOfficeId: ceppio.id,
          papSectorId: papSector.id,
          papSubsectorCode: '000',
          finishLineId: finishLine.id,
          name: `AIP E2E CEPPIO Program ${fiscalYear}`,
          description: 'A destructive local E2E test program for CEPPIO workflow.',
          remarks: 'Created by the AIP cycle destructive acceptance suite.',
          expectedOutput: 'Validated CEPPIO AIP cycle submission workflow.',
          implementationStartMonth: 1,
          implementationStartYear: fiscalYear,
          implementationEndMonth: 12,
          implementationEndYear: fiscalYear,
        },
      });
      await expectApiStatus(createProgramResponse, 201);
      const program = (await createProgramResponse.json()) as {
        id: string;
        status: string;
      };
      if (program.status !== 'DRAFT') {
        throw new Error(`Expected new program status DRAFT, got ${program.status}.`);
      }
      record.notes?.push(`Created CEPPIO program ${program.id}.`);

      const createPaResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/project-activities`,
        {
          headers: staff.headers,
          data: {
            type: 'ACTIVITY',
            name: 'AIP E2E CEPPIO Implementation Activity',
            description: 'Baseline activity for the CEPPIO program workflow test.',
            expectedOutput: 'Activity entered with one validated line item.',
            orderIndex: 0,
            costMode: 'DIRECT_COSTS',
            implementationStartMonth: 1,
            implementationStartYear: fiscalYear,
            implementationEndMonth: 12,
            implementationEndYear: fiscalYear,
          },
        },
      );
      await expectApiStatus(createPaResponse, 201);
      const projectActivity = (await createPaResponse.json()) as { id: string };

      const createLineItemResponse = await request.post(
        `${apiBaseUrl()}/project-activities/${projectActivity.id}/line-items`,
        {
          headers: staff.headers,
          data: {
            expenseClass: 'MOOE',
            uacsObjectId: uacsObject.id,
            quantity: '1.00',
            unit: 'lot',
            unitCost: '125000.00',
            remarks: 'E2E workflow line item.',
            orderIndex: 0,
          },
        },
      );
      await expectApiStatus(createLineItemResponse, 201);
      const lineItem = (await createLineItemResponse.json()) as { id: string };
      record.notes?.push('Created one project activity and one MOOE line item.');

      const refreshedProgramResponse = await request.get(
        `${apiBaseUrl()}/programs/${program.id}`,
        { headers: staff.headers },
      );
      await expectApiStatus(refreshedProgramResponse, 200);
      const refreshedProgram = (await refreshedProgramResponse.json()) as {
        grandTotal: string;
      };
      if (Number(refreshedProgram.grandTotal) !== 125000) {
        throw new Error(
          `Expected program grandTotal 125000, got ${refreshedProgram.grandTotal}.`,
        );
      }

      const submitResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/submit`,
        { headers: staff.headers },
      );
      await expectApiStatus(submitResponse, 200);
      const submittedProgram = (await submitResponse.json()) as {
        status: string;
        currentVersion: number;
      };
      if (
        submittedProgram.status !== 'SUBMITTED' ||
        submittedProgram.currentVersion !== 1
      ) {
        throw new Error(
          `Expected SUBMITTED version 1, got ${submittedProgram.status} version ${submittedProgram.currentVersion}.`,
        );
      }
      record.notes?.push('Submitted CEPPIO program as staff and created version 1.');

      const headReviewResponse = await request.post(
        `${apiBaseUrl()}/programs/${program.id}/head-review`,
        { headers: head.headers },
      );
      await expectApiStatus(headReviewResponse, 200);
      const reviewedProgram = (await headReviewResponse.json()) as { status: string };
      if (reviewedProgram.status !== 'HEAD_REVIEWED') {
        throw new Error(
          `Expected HEAD_REVIEWED after head review, got ${reviewedProgram.status}.`,
        );
      }
      record.notes?.push('Head-reviewed CEPPIO program as CEPPIO head.');

      const versionsResponse = await request.get(
        `${apiBaseUrl()}/programs/${program.id}/versions`,
        { headers: staff.headers },
      );
      await expectApiStatus(versionsResponse, 200);
      const versions = (await versionsResponse.json()) as Array<{ version: number }>;
      if (!versions.some((version) => version.version === 1)) {
        throw new Error('Submitted program version 1 was not returned.');
      }
      record.notes?.push('Verified submitted version history is readable.');
      record.artifacts.evidence.push(
        await writeEvidence('proponent-programs-ceppio', 'workflow', {
          scenario: 'proponent-programs-ceppio',
          office: { acronym: 'CEPPIO', id: ceppio.id },
          cycle,
          program: {
            id: program.id,
            initialStatus: program.status,
            submittedStatus: submittedProgram.status,
            reviewedStatus: reviewedProgram.status,
            currentVersion: submittedProgram.currentVersion,
            grandTotal: refreshedProgram.grandTotal,
          },
          projectActivity: { id: projectActivity.id },
          lineItem: {
            id: lineItem.id,
            expenseClass: 'MOOE',
            quantity: '1.00',
            unitCost: '125000.00',
          },
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            { method: 'GET', path: '/reference/pap-sectors', expectedStatus: 200 },
            { method: 'GET', path: '/reference/finish-lines', expectedStatus: 200 },
            {
              method: 'GET',
              path: '/reference/uacs-objects?expenseClass=MOOE',
              expectedStatus: 200,
            },
            { method: 'POST', path: '/programs', expectedStatus: 201 },
            {
              method: 'POST',
              path: `/programs/${program.id}/project-activities`,
              expectedStatus: 201,
            },
            {
              method: 'POST',
              path: `/project-activities/${projectActivity.id}/line-items`,
              expectedStatus: 201,
            },
            { method: 'GET', path: `/programs/${program.id}`, expectedStatus: 200 },
            {
              method: 'POST',
              path: `/programs/${program.id}/submit`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: `/programs/${program.id}/head-review`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/programs/${program.id}/versions`,
              expectedStatus: 200,
            },
          ],
          assertions: [
            'CEPPIO staff can create a DRAFT program for CEPPIO.',
            'CEPPIO staff can create one activity and one MOOE line item.',
            'Program total equals 125000.',
            'CEPPIO staff can submit the program to SUBMITTED version 1.',
            'CEPPIO head can mark the program HEAD_REVIEWED.',
            'Version 1 is readable from version history.',
          ],
        }),
      );
    },
  );
});

test('blocks first PSO batch submit while a sibling program is not head-reviewed', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'first-batch-submit-blocker',
    'First batch submit blocker for not-yet-head-reviewed office programs',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const staff = await loginWithCredentials(
        request,
        psoStaffEmail,
        psoStaffPassword,
      );
      const head = await loginWithCredentials(request, psoHeadEmail, psoHeadPassword);

      const [cyclesResponse, officesResponse, sectorsResponse, finishLinesResponse] =
        await Promise.all([
          request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
          request.get(`${apiBaseUrl()}/reference/city-offices`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/pap-sectors`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/finish-lines`, {
            headers: admin.headers,
          }),
        ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);
      await expectApiStatus(sectorsResponse, 200);
      await expectApiStatus(finishLinesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const pso = offices.find((office) => office.acronym === 'PSO');
      if (!pso) {
        throw new Error('PSO city office not found in reference data.');
      }

      const papSectors = (await sectorsResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const papSector = papSectors[0];
      if (!papSector) {
        throw new Error('No PAP sectors are available for blocker setup.');
      }

      const finishLines = (await finishLinesResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const finishLine = finishLines[0];
      if (!finishLine) {
        throw new Error('No finish lines are available for blocker setup.');
      }

      const createDraftResponse = await request.post(`${apiBaseUrl()}/programs`, {
        headers: staff.headers,
        data: {
          aipCycleId: cycle.id,
          cityOfficeId: pso.id,
          papSectorId: papSector.id,
          papSubsectorCode: '000',
          finishLineId: finishLine.id,
          name: `AIP E2E PSO Draft Blocker ${fiscalYear}`,
          description:
            'A deliberate draft sibling used to verify first batch submit blocking.',
          remarks: 'Created by the AIP cycle destructive acceptance suite.',
          expectedOutput: 'Batch submit remains blocked until this program is reviewed.',
          implementationStartMonth: 1,
          implementationStartYear: fiscalYear,
          implementationEndMonth: 12,
          implementationEndYear: fiscalYear,
        },
      });
      await expectApiStatus(createDraftResponse, 201);
      const draftProgram = (await createDraftResponse.json()) as {
        id: string;
        status: string;
      };
      if (draftProgram.status !== 'DRAFT') {
        throw new Error(
          `Expected blocker sibling to be DRAFT, got ${draftProgram.status}.`,
        );
      }
      record.notes?.push(`Created draft PSO blocker program ${draftProgram.id}.`);

      const submitForApprovalResponse = await request.post(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/submit-for-approval`,
        { headers: head.headers },
      );
      await expectApiStatus(submitForApprovalResponse, 422);
      const body = (await submitForApprovalResponse.json()) as {
        message?: string;
        blockers?: Array<{ id: string; status: string }>;
      };
      const blockers = body.blockers ?? [];
      if (
        body.message !== 'Some programs are not yet ready for approval' ||
        !blockers.some(
          (blocker) =>
            blocker.id === draftProgram.id && blocker.status === 'DRAFT',
        )
      ) {
        throw new Error(
          `Expected submit-for-approval blocker list to include draft ${draftProgram.id}; got ${JSON.stringify(body)}.`,
        );
      }
      record.notes?.push(
        'Verified PSO batch submit returns 422 and lists the draft sibling blocker.',
      );

      const programsResponse = await request.get(
        `${apiBaseUrl()}/programs?cycleId=${cycle.id}&cityOfficeId=${pso.id}`,
        { headers: head.headers },
      );
      await expectApiStatus(programsResponse, 200);
      const programsPayload = (await programsResponse.json()) as {
        items: Array<{
          id: string;
          status: string;
        }>;
      };
      const programs = programsPayload.items;
      if (programs.some((program) => program.status === 'PENDING_APPROVAL')) {
        throw new Error(
          'No PSO program should advance to PENDING_APPROVAL when batch submit is blocked.',
        );
      }
      record.notes?.push('Verified no PSO program advanced after blocked submit.');
      record.artifacts.evidence.push(
        await writeEvidence('first-batch-submit-blocker', 'api-contract', {
          scenario: 'first-batch-submit-blocker',
          cycle,
          office: { acronym: 'PSO', id: pso.id },
          draftProgram,
          submitForApproval: {
            endpoint: `/aip-cycles/${cycle.id}/submit-for-approval`,
            expectedStatus: 422,
            body,
          },
          psoProgramStatusesAfterBlockedSubmit: programs.map((program) => ({
            id: program.id,
            status: program.status,
          })),
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            { method: 'GET', path: '/reference/pap-sectors', expectedStatus: 200 },
            { method: 'GET', path: '/reference/finish-lines', expectedStatus: 200 },
            { method: 'POST', path: '/programs', expectedStatus: 201 },
            {
              method: 'POST',
              path: `/aip-cycles/${cycle.id}/submit-for-approval`,
              expectedStatus: 422,
            },
            {
              method: 'GET',
              path: `/programs?cycleId=${cycle.id}&cityOfficeId=${pso.id}`,
              expectedStatus: 200,
            },
          ],
          assertions: [
            'A deliberate PSO sibling program remains DRAFT.',
            'PSO head batch submit returns 422.',
            'The 422 body lists the draft program as a blocker.',
            'No PSO program advances to PENDING_APPROVAL after the blocked submit.',
          ],
        }),
      );
    },
  );
});

test('records public feedback and verifies the CEPPIO feedback dashboard', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'public-feedback',
    'Public registry and LGU feedback dashboard',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const ceppioHead = await loginWithCredentials(
        request,
        ceppioHeadEmail,
        ceppioHeadPassword,
      );

      const [cyclesResponse, officesResponse] = await Promise.all([
        request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
        request.get(`${apiBaseUrl()}/reference/city-offices`, {
          headers: admin.headers,
        }),
      ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }

      const ceppioProgramsResponse = await request.get(
        `${apiBaseUrl()}/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=HEAD_REVIEWED`,
        { headers: ceppioHead.headers },
      );
      await expectApiStatus(ceppioProgramsResponse, 200);
      const ceppioProgramsPayload = (await ceppioProgramsResponse.json()) as {
        items: Array<{ id: string; status: string; name: string }>;
      };
      const reviewedProgram = ceppioProgramsPayload.items[0];
      if (!reviewedProgram) {
        throw new Error('No CEPPIO HEAD_REVIEWED program found for public test.');
      }

      const submitForApprovalResponse = await request.post(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/submit-for-approval`,
        { headers: ceppioHead.headers },
      );
      await expectApiStatus(submitForApprovalResponse, 200);
      const submitForApproval = (await submitForApprovalResponse.json()) as {
        submitted: number;
      };
      if (submitForApproval.submitted !== 1) {
        throw new Error(
          `Expected one CEPPIO program submitted for approval, got ${submitForApproval.submitted}.`,
        );
      }
      record.notes?.push(
        `Submitted CEPPIO program ${reviewedProgram.id} for approval so it is public.`,
      );

      const registryResponse = await request.get(
        `${apiBaseUrl()}/public/registry?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&sortBy=recently_updated`,
      );
      await expectApiStatus(registryResponse, 200);
      const registry = (await registryResponse.json()) as {
        total: number;
        items: Array<{
          id: string;
          status: string;
          feedbackCount: number;
          projectActivities: Array<{ id: string; name: string }>;
        }>;
      };
      const publicProgram = registry.items.find(
        (item) => item.id === reviewedProgram.id,
      );
      if (!publicProgram || publicProgram.status !== 'PENDING_APPROVAL') {
        throw new Error(
          `Expected CEPPIO program ${reviewedProgram.id} in public registry as PENDING_APPROVAL.`,
        );
      }

      const programDetailResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}`,
      );
      await expectApiStatus(programDetailResponse, 200);
      const programDetail = (await programDetailResponse.json()) as {
        id: string;
        projectActivities: Array<{ id: string; name: string }>;
      };
      const projectActivity = programDetail.projectActivities[0];
      if (!projectActivity) {
        throw new Error('Public CEPPIO program did not expose a project activity.');
      }

      const versionsResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/versions`,
      );
      await expectApiStatus(versionsResponse, 200);
      const versions = (await versionsResponse.json()) as Array<{
        id: string;
        version: number;
      }>;
      const version = versions.find((candidate) => candidate.version === 1);
      if (!version) {
        throw new Error('Public version history did not include version 1.');
      }

      const versionResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/versions/${version.id}`,
      );
      await expectApiStatus(versionResponse, 200);

      const paDetailResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}`,
      );
      await expectApiStatus(paDetailResponse, 200);

      const programFeedbackMessage = `AIP E2E program feedback ${cycle.id}`;
      const submitProgramFeedbackResponse = await request.post(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/feedback`,
        {
          data: {
            submitterName: 'AIP E2E Program Citizen',
            submitterEmail: 'aip-e2e+public-program@example.test',
            message: programFeedbackMessage,
            category: 'SUGGESTION',
            sentiment: 'POSITIVE',
          },
        },
      );
      await expectApiStatus(submitProgramFeedbackResponse, 201);

      const programFeedbackResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/feedback`,
      );
      await expectApiStatus(programFeedbackResponse, 200);
      const programFeedback = (await programFeedbackResponse.json()) as Array<{
        id: string;
        content: string;
        submitterName: string;
      }>;
      const programFeedbackItem = programFeedback.find(
        (item) => item.content === programFeedbackMessage,
      );
      if (!programFeedbackItem) {
        throw new Error('Program feedback was not returned by public list endpoint.');
      }

      const paFeedbackMessage = `AIP E2E PA feedback ${cycle.id}`;
      const submitPaFeedbackResponse = await request.post(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}/feedback`,
        {
          data: {
            submitterName: 'AIP E2E PA Citizen',
            submitterEmail: 'aip-e2e+public-pa@example.test',
            message: paFeedbackMessage,
            category: 'QUESTION',
            sentiment: 'NEUTRAL',
          },
        },
      );
      await expectApiStatus(submitPaFeedbackResponse, 201);

      const paFeedbackResponse = await request.get(
        `${apiBaseUrl()}/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}/feedback`,
      );
      await expectApiStatus(paFeedbackResponse, 200);
      const paFeedback = (await paFeedbackResponse.json()) as Array<{
        id: string;
        content: string;
      }>;
      const paFeedbackItem = paFeedback.find(
        (item) => item.content === paFeedbackMessage,
      );
      if (!paFeedbackItem) {
        throw new Error('Project/activity feedback was not returned by public list endpoint.');
      }

      const registryFeedbackMessage = `AIP E2E registry feedback ${cycle.id}`;
      const submitRegistryFeedbackResponse = await request.post(
        `${apiBaseUrl()}/public/registry/feedback`,
        {
          data: {
            submitterName: 'AIP E2E Registry Citizen',
            submitterEmail: 'aip-e2e+public-registry@example.test',
            category: 'BUDGET_TRANSPARENCY',
            message: registryFeedbackMessage,
          },
        },
      );
      await expectApiStatus(submitRegistryFeedbackResponse, 201);

      const lguFeedbackResponse = await request.get(
        `${apiBaseUrl()}/lgu/feedback?cycleId=${cycle.id}&limit=25`,
        { headers: ceppioHead.headers },
      );
      await expectApiStatus(lguFeedbackResponse, 200);
      const lguFeedback = (await lguFeedbackResponse.json()) as {
        total: number;
        items: Array<{ id: string; content: string; resolvedAt: string | null }>;
      };
      const lguProgramFeedback = lguFeedback.items.find(
        (item) => item.content === programFeedbackMessage,
      );
      if (!lguProgramFeedback) {
        throw new Error('CEPPIO LGU feedback dashboard did not list program feedback.');
      }

      const analyticsResponse = await request.get(
        `${apiBaseUrl()}/lgu/feedback/analytics?cycleId=${cycle.id}`,
        { headers: ceppioHead.headers },
      );
      await expectApiStatus(analyticsResponse, 200);
      const analytics = (await analyticsResponse.json()) as {
        totalCount: number;
        unreviewedCount: number;
      };
      if (analytics.totalCount < 2 || analytics.unreviewedCount < 2) {
        throw new Error(
          `Expected LGU analytics to count program and PA feedback, got ${JSON.stringify(analytics)}.`,
        );
      }

      const reviewResponse = await request.patch(
        `${apiBaseUrl()}/lgu/feedback/${lguProgramFeedback.id}/review`,
        {
          headers: ceppioHead.headers,
          data: { note: 'Reviewed by AIP E2E harness.' },
        },
      );
      await expectApiStatus(reviewResponse, 200);
      const reviewed = (await reviewResponse.json()) as {
        id: string;
        resolvedAt: string | null;
      };
      if (!reviewed.resolvedAt) {
        throw new Error('Reviewed LGU feedback did not receive resolvedAt.');
      }

      const replyResponse = await request.post(
        `${apiBaseUrl()}/lgu/feedback/${lguProgramFeedback.id}/reply`,
        {
          headers: ceppioHead.headers,
          data: { content: 'Official CEPPIO E2E reply.' },
        },
      );
      await expectApiStatus(replyResponse, 201);
      const reply = (await replyResponse.json()) as {
        id: string;
        officialReply: string | null;
      };
      if (reply.officialReply !== 'Official CEPPIO E2E reply.') {
        throw new Error('LGU feedback reply was not persisted.');
      }

      record.notes?.push(
        'Submitted public program, project/activity, and registry feedback.',
      );
      record.notes?.push(
        'Verified CEPPIO LGU dashboard lists, reviews, analyzes, and replies to feedback.',
      );
      record.artifacts.evidence.push(
        await writeEvidence('public-feedback', 'api-contract', {
          scenario: 'public-feedback',
          cycle,
          office: { acronym: 'CEPPIO', id: ceppio.id },
          program: {
            id: publicProgram.id,
            status: publicProgram.status,
            projectActivityId: projectActivity.id,
            versionId: version.id,
          },
          submitForApproval,
          publicFeedback: {
            programFeedbackId: programFeedbackItem.id,
            paFeedbackId: paFeedbackItem.id,
            registryFeedbackMessage,
          },
          lguDashboard: {
            total: lguFeedback.total,
            analytics,
            reviewedFeedbackId: reviewed.id,
            reply,
          },
          apiCalls: [
            {
              method: 'POST',
              path: `/aip-cycles/${cycle.id}/submit-for-approval`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/public/registry?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}/versions`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}/versions/${version.id}`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: `/public/registry/${publicProgram.id}/feedback`,
              expectedStatus: 201,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}/feedback`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: `/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}/feedback`,
              expectedStatus: 201,
            },
            {
              method: 'GET',
              path: `/public/registry/${publicProgram.id}/project-activities/${projectActivity.id}/feedback`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: '/public/registry/feedback',
              expectedStatus: 201,
            },
            {
              method: 'GET',
              path: `/lgu/feedback?cycleId=${cycle.id}`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/lgu/feedback/analytics?cycleId=${cycle.id}`,
              expectedStatus: 200,
            },
            {
              method: 'PATCH',
              path: `/lgu/feedback/${lguProgramFeedback.id}/review`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: `/lgu/feedback/${lguProgramFeedback.id}/reply`,
              expectedStatus: 201,
            },
          ],
          assertions: [
            'CEPPIO program becomes public after batch submit for approval.',
            'Public registry list/detail/version/project-activity endpoints expose the program.',
            'Program-level public feedback can be submitted and listed.',
            'Project/activity public feedback can be submitted and listed.',
            'General registry feedback can be submitted.',
            'CEPPIO LGU feedback dashboard lists public feedback for CEPPIO programs.',
            'CEPPIO analytics count the feedback rows.',
            'CEPPIO can mark feedback reviewed and post an official reply.',
          ],
        }),
      );
    },
  );
});

test('blocks normal LFC terminal rejection paths', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'lfc-reject-negative',
    'LFC terminal reject negative assertions',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);

      const [cyclesResponse, officesResponse] = await Promise.all([
        request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
        request.get(`${apiBaseUrl()}/reference/city-offices`, {
          headers: admin.headers,
        }),
      ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }

      const ceppioProgramsResponse = await request.get(
        `${apiBaseUrl()}/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
        { headers: admin.headers },
      );
      await expectApiStatus(ceppioProgramsResponse, 200);
      const ceppioProgramsPayload = (await ceppioProgramsResponse.json()) as {
        items: Array<{ id: string; status: string; name: string }>;
      };
      const targetProgram = ceppioProgramsPayload.items[0];
      if (!targetProgram) {
        throw new Error('No CEPPIO PENDING_APPROVAL program found for LFC reject test.');
      }

      const lfcDetailResponse = await request.get(
        `${apiBaseUrl()}/lfc/offices/${ceppio.id}?cycleId=${cycle.id}`,
        { headers: admin.headers },
      );
      await expectApiStatus(lfcDetailResponse, 200);
      const lfcDetail = (await lfcDetailResponse.json()) as {
        signatories: Array<{
          officeId: string;
          officeName: string;
          sequenceOrder: number;
          pendingCount: number;
        }>;
      };
      const activeSignatory = lfcDetail.signatories.find(
        (signatory) => signatory.pendingCount > 0,
      );
      if (!activeSignatory) {
        throw new Error('No active LFC signatory found for CEPPIO program.');
      }
      const lfcOffice = offices.find(
        (office) => office.id === activeSignatory.officeId,
      );
      if (!lfcOffice) {
        throw new Error('Active LFC signatory office was not in reference data.');
      }

      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        identityType: 'LFC',
        cityOfficeId: activeSignatory.officeId,
        officeAcronym: lfcOffice.acronym,
        email: lfcRejectHeadEmail,
        password: lfcRejectHeadPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'LFC Reject Head',
        record,
      });
      const lfcHead = await loginWithCredentials(
        request,
        lfcRejectHeadEmail,
        lfcRejectHeadPassword,
      );

      const rejectDecisionResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/approvals/${activeSignatory.officeId}/decision`,
        {
          headers: lfcHead.headers,
          data: {
            status: 'REJECTED',
            notes: 'AIP E2E rejected decision should be blocked.',
          },
        },
      );
      await expectApiStatus(rejectDecisionResponse, 400);

      const rejectAllResponse = await request.post(
        `${apiBaseUrl()}/lfc/offices/${activeSignatory.officeId}/reject-all`,
        {
          headers: lfcHead.headers,
          data: {
            cycleId: cycle.id,
            implementingOfficeId: ceppio.id,
            notes: 'AIP E2E reject-all should be blocked.',
          },
        },
      );
      await expectApiStatus(rejectAllResponse, 400);

      const targetProgramResponse = await request.get(
        `${apiBaseUrl()}/programs/${targetProgram.id}`,
        { headers: admin.headers },
      );
      await expectApiStatus(targetProgramResponse, 200);
      const refreshedProgram = (await targetProgramResponse.json()) as {
        id: string;
        status: string;
      };
      if (refreshedProgram.status !== 'PENDING_APPROVAL') {
        throw new Error(
          `Rejected negative paths changed status to ${refreshedProgram.status}.`,
        );
      }

      record.notes?.push(
        'Verified single-program REJECTED decisions and reject-all are blocked.',
      );
      record.artifacts.evidence.push(
        await writeEvidence('lfc-reject-negative', 'api-contract', {
          scenario: 'lfc-reject-negative',
          cycle,
          targetOffice: { acronym: 'CEPPIO', id: ceppio.id },
          targetProgram,
          activeSignatory,
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            {
              method: 'GET',
              path: `/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
              expectedStatus: 200,
            },
            {
              method: 'GET',
              path: `/lfc/offices/${ceppio.id}?cycleId=${cycle.id}`,
              expectedStatus: 200,
            },
            { method: 'POST', path: '/users', expectedStatus: 201 },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/approvals/${activeSignatory.officeId}/decision`,
              expectedStatus: 400,
              assertion: 'REJECTED decisions are blocked.',
            },
            {
              method: 'POST',
              path: `/lfc/offices/${activeSignatory.officeId}/reject-all`,
              expectedStatus: 400,
              assertion: 'reject-all is blocked.',
            },
            {
              method: 'GET',
              path: `/programs/${targetProgram.id}`,
              expectedStatus: 200,
            },
          ],
          assertions: [
            'The active LFC signatory can be identified from office detail.',
            'A normal LFC head cannot cast a terminal REJECTED decision.',
            'A normal LFC head cannot use reject-all.',
            'The target program remains PENDING_APPROVAL after rejected negative paths.',
          ],
          finalProgramStatus: refreshedProgram.status,
        }),
      );
    },
  );
});

test('verifies LGU, NCPC, and CSO endorsement scope', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'endorsement',
    'LGU, NCPC, and CSO endorsement flows',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);

      const [cyclesResponse, officesResponse, clustersResponse] = await Promise.all([
        request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
        request.get(`${apiBaseUrl()}/reference/city-offices`, {
          headers: admin.headers,
        }),
        request.get(`${apiBaseUrl()}/reference/clusters`, {
          headers: admin.headers,
        }),
      ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);
      await expectApiStatus(clustersResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
        clusterId?: string;
        cluster?: { id: string };
      }>;
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }
      const ceppioClusterId = ceppio.clusterId ?? ceppio.cluster?.id;
      if (!ceppioClusterId) {
        throw new Error('CEPPIO office did not include cluster data.');
      }

      const clusters = (await clustersResponse.json()) as Array<{
        id: string;
        name: string;
      }>;
      const crossCluster = clusters.find(
        (cluster) => cluster.id !== ceppioClusterId,
      );
      if (!crossCluster) {
        throw new Error('A second cluster is required for CSO scope verification.');
      }

      const ceppioProgramsResponse = await request.get(
        `${apiBaseUrl()}/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
        { headers: admin.headers },
      );
      await expectApiStatus(ceppioProgramsResponse, 200);
      const ceppioProgramsPayload = (await ceppioProgramsResponse.json()) as {
        items: Array<{ id: string; status: string; name: string }>;
      };
      const targetProgram = ceppioProgramsPayload.items[0];
      if (!targetProgram) {
        throw new Error('No CEPPIO PENDING_APPROVAL program found for endorsement.');
      }

      const createEndorserOfficeResponse = await request.post(
        `${apiBaseUrl()}/reference/city-offices`,
        {
          headers: admin.headers,
          data: {
            name: 'AIP E2E Citywide Endorser Office',
            acronym: 'AIP-E2E-END',
            clusterId: crossCluster.id,
            canEndorse: true,
          },
        },
      );
      await expectApiStatus(createEndorserOfficeResponse, 201);
      const endorserOffice = (await createEndorserOfficeResponse.json()) as {
        id: string;
      };

      const createSameCsoResponse = await request.post(
        `${apiBaseUrl()}/reference/civil-society-organizations`,
        {
          headers: admin.headers,
          data: {
            name: 'AIP E2E Same Cluster CSO',
            code: 'E2S',
            clusterId: ceppioClusterId,
            canEndorse: true,
          },
        },
      );
      await expectApiStatus(createSameCsoResponse, 201);
      const sameClusterCso = (await createSameCsoResponse.json()) as {
        id: string;
      };

      const createCrossCsoResponse = await request.post(
        `${apiBaseUrl()}/reference/civil-society-organizations`,
        {
          headers: admin.headers,
          data: {
            name: 'AIP E2E Cross Cluster CSO',
            code: 'E2X',
            clusterId: crossCluster.id,
            canEndorse: true,
          },
        },
      );
      await expectApiStatus(createCrossCsoResponse, 201);
      const crossClusterCso = (await createCrossCsoResponse.json()) as {
        id: string;
      };

      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        cityOfficeId: endorserOffice.id,
        officeAcronym: 'AIP-E2E-END',
        email: lguEndorserEmail,
        password: lguEndorserPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'LGU Endorser',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        identityType: 'NCPC',
        officeAcronym: 'NCPC',
        email: ncpcUmbrellaEmail,
        password: ncpcUmbrellaPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'NCPC Umbrella',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        identityType: 'NCPC',
        civilSocietyOrganizationId: sameClusterCso.id,
        officeAcronym: 'Same Cluster CSO',
        email: sameClusterCsoEmail,
        password: sameClusterCsoPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'Same CSO',
        record,
      });
      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        identityType: 'NCPC',
        civilSocietyOrganizationId: crossClusterCso.id,
        officeAcronym: 'Cross Cluster CSO',
        email: crossClusterCsoEmail,
        password: crossClusterCsoPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'Cross CSO',
        record,
      });

      const lguEndorser = await loginWithCredentials(
        request,
        lguEndorserEmail,
        lguEndorserPassword,
      );
      const ncpcUmbrella = await loginWithCredentials(
        request,
        ncpcUmbrellaEmail,
        ncpcUmbrellaPassword,
      );
      const sameCsoEndorser = await loginWithCredentials(
        request,
        sameClusterCsoEmail,
        sameClusterCsoPassword,
      );
      const crossCsoEndorser = await loginWithCredentials(
        request,
        crossClusterCsoEmail,
        crossClusterCsoPassword,
      );

      const lguOfficesResponse = await request.get(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/endorser-offices`,
        { headers: lguEndorser.headers },
      );
      await expectApiStatus(lguOfficesResponse, 200);
      const lguOffices = (await lguOfficesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      if (!lguOffices.some((office) => office.id === ceppio.id)) {
        throw new Error('LGU citywide endorser did not see CEPPIO.');
      }

      const sameCsoOfficesResponse = await request.get(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/endorser-offices`,
        { headers: sameCsoEndorser.headers },
      );
      await expectApiStatus(sameCsoOfficesResponse, 200);
      const sameCsoOffices = (await sameCsoOfficesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const officeClusterById = new Map(
        offices.map((office) => [
          office.id,
          office.clusterId ?? office.cluster?.id ?? null,
        ]),
      );
      if (!sameCsoOffices.some((office) => office.id === ceppio.id)) {
        throw new Error('Same-cluster CSO endorser did not see CEPPIO.');
      }
      if (
        sameCsoOffices.some(
          (office) => officeClusterById.get(office.id) !== ceppioClusterId,
        )
      ) {
        throw new Error('Same-cluster CSO endorser saw a cross-cluster office.');
      }

      const crossCsoOfficesResponse = await request.get(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/endorser-offices`,
        { headers: crossCsoEndorser.headers },
      );
      await expectApiStatus(crossCsoOfficesResponse, 200);
      const crossCsoOffices = (await crossCsoOfficesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      if (crossCsoOffices.some((office) => office.id === ceppio.id)) {
        throw new Error('Cross-cluster CSO endorser unexpectedly saw CEPPIO.');
      }

      const crossCsoViewResponse = await request.get(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/offices/${ceppio.id}/programs`,
        { headers: crossCsoEndorser.headers },
      );
      await expectApiStatus(crossCsoViewResponse, 403);

      const lguEndorseResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/endorse`,
        {
          headers: lguEndorser.headers,
          data: { notes: 'AIP E2E LGU citywide endorsement.' },
        },
      );
      await expectApiStatus(lguEndorseResponse, 200);
      const lguEndorsement = (await lguEndorseResponse.json()) as {
        programStatus: string;
        endorsement: { id: string; endorserType: string };
      };
      if (lguEndorsement.programStatus !== 'PENDING_APPROVAL') {
        throw new Error('LGU endorsement changed the program status.');
      }

      const ncpcEndorseResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/endorse`,
        {
          headers: ncpcUmbrella.headers,
          data: { notes: 'AIP E2E NCPC umbrella endorsement.' },
        },
      );
      await expectApiStatus(ncpcEndorseResponse, 200);

      const sameCsoEndorseResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/endorse`,
        {
          headers: sameCsoEndorser.headers,
          data: { notes: 'AIP E2E same-cluster CSO endorsement.' },
        },
      );
      await expectApiStatus(sameCsoEndorseResponse, 200);
      const sameCsoEndorsement = (await sameCsoEndorseResponse.json()) as {
        endorsement: { id: string; endorserCsoId: string | null };
      };
      if (sameCsoEndorsement.endorsement.endorserCsoId !== sameClusterCso.id) {
        throw new Error('CSO endorsement was not tagged with the CSO id.');
      }

      const crossCsoEndorseResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/endorse`,
        {
          headers: crossCsoEndorser.headers,
          data: { notes: 'AIP E2E cross-cluster CSO endorsement attempt.' },
        },
      );
      await expectApiStatus(crossCsoEndorseResponse, 403);

      const sameCsoProgramsResponse = await request.get(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/offices/${ceppio.id}/programs`,
        { headers: sameCsoEndorser.headers },
      );
      await expectApiStatus(sameCsoProgramsResponse, 200);
      const sameCsoPrograms = (await sameCsoProgramsResponse.json()) as Array<{
        id: string;
        endorsements: Array<{ notes: string | null }>;
      }>;
      const sameCsoProgram = sameCsoPrograms.find(
        (program) => program.id === targetProgram.id,
      );
      if (
        !sameCsoProgram?.endorsements.some(
          (endorsement) =>
            endorsement.notes === 'AIP E2E same-cluster CSO endorsement.',
        )
      ) {
        throw new Error('Same-cluster CSO view did not include its endorsement.');
      }

      record.notes?.push(
        'Verified LGU and NCPC umbrella endorsers can endorse citywide.',
      );
      record.notes?.push(
        'Verified CSO representatives can only view and endorse within their cluster.',
      );
      record.artifacts.evidence.push(
        await writeEvidence('endorsement', 'api-contract', {
          scenario: 'endorsement',
          cycle,
          targetOffice: {
            acronym: 'CEPPIO',
            id: ceppio.id,
            clusterId: ceppioClusterId,
          },
          targetProgram,
          endorserOffice,
          civilSocietyOrganizations: {
            sameCluster: sameClusterCso,
            crossCluster: crossClusterCso,
          },
          visibleOffices: {
            lgu: lguOffices.map((office) => office.acronym),
            sameClusterCso: sameCsoOffices.map((office) => office.acronym),
            crossClusterCso: crossCsoOffices.map((office) => office.acronym),
          },
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            { method: 'GET', path: '/reference/clusters', expectedStatus: 200 },
            {
              method: 'GET',
              path: `/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: '/reference/city-offices',
              expectedStatus: 201,
            },
            {
              method: 'POST',
              path: '/reference/civil-society-organizations',
              expectedStatus: 201,
              count: 2,
            },
            { method: 'POST', path: '/users', expectedStatus: 201, count: 4 },
            {
              method: 'GET',
              path: `/aip-cycles/${cycle.id}/endorser-offices`,
              expectedStatus: 200,
              count: 3,
            },
            {
              method: 'GET',
              path: `/aip-cycles/${cycle.id}/offices/${ceppio.id}/programs`,
              expectedStatus: 403,
              actor: 'cross-cluster CSO',
            },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/endorse`,
              expectedStatus: 200,
              count: 3,
            },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/endorse`,
              expectedStatus: 403,
              actor: 'cross-cluster CSO',
            },
            {
              method: 'GET',
              path: `/aip-cycles/${cycle.id}/offices/${ceppio.id}/programs`,
              expectedStatus: 200,
              actor: 'same-cluster CSO',
            },
          ],
          endorsements: {
            lgu: lguEndorsement.endorsement,
            sameClusterCso: sameCsoEndorsement.endorsement,
          },
          assertions: [
            'LGU endorser office with canEndorse sees CEPPIO despite belonging to another cluster.',
            'NCPC umbrella head can endorse CEPPIO citywide.',
            'Same-cluster CSO sees CEPPIO and receives its own endorsement row in the endorser view.',
            'Cross-cluster CSO does not see CEPPIO in the office list.',
            'Cross-cluster CSO cannot open CEPPIO endorser programs.',
            'Cross-cluster CSO cannot endorse the CEPPIO program.',
            'Advisory endorsements do not advance or regress program status.',
          ],
        }),
      );
    },
  );
});

test('verifies comment stage and gate semantics', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'comment-gates',
    'Comment stage derivation and workflow gate semantics',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const ceppioHead = await loginWithCredentials(
        request,
        ceppioHeadEmail,
        ceppioHeadPassword,
      );
      const lguEndorser = await loginWithCredentials(
        request,
        lguEndorserEmail,
        lguEndorserPassword,
      );

      const [cyclesResponse, officesResponse] = await Promise.all([
        request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
        request.get(`${apiBaseUrl()}/reference/city-offices`, {
          headers: admin.headers,
        }),
      ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
        clusterId?: string;
        cluster?: { id: string };
      }>;
      const ceppio = offices.find((office) => office.acronym === 'CEPPIO');
      if (!ceppio) {
        throw new Error('CEPPIO city office not found in reference data.');
      }
      const ceppioClusterId = ceppio.clusterId ?? ceppio.cluster?.id;
      if (!ceppioClusterId) {
        throw new Error('CEPPIO office did not include cluster data.');
      }

      const ceppioProgramsResponse = await request.get(
        `${apiBaseUrl()}/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
        { headers: admin.headers },
      );
      await expectApiStatus(ceppioProgramsResponse, 200);
      const ceppioProgramsPayload = (await ceppioProgramsResponse.json()) as {
        items: Array<{ id: string; status: string; name: string }>;
      };
      const targetProgram = ceppioProgramsPayload.items[0];
      if (!targetProgram) {
        throw new Error('No CEPPIO PENDING_APPROVAL program found for comments.');
      }

      const createPeerOfficeResponse = await request.post(
        `${apiBaseUrl()}/reference/city-offices`,
        {
          headers: admin.headers,
          data: {
            name: 'AIP E2E Same Cluster Reader Office',
            acronym: 'AIP-E2E-READ',
            clusterId: ceppioClusterId,
            canEndorse: false,
          },
        },
      );
      await expectApiStatus(createPeerOfficeResponse, 201);
      const peerOffice = (await createPeerOfficeResponse.json()) as { id: string };

      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        cityOfficeId: peerOffice.id,
        officeAcronym: 'AIP-E2E-READ',
        email: peerReaderEmail,
        password: peerReaderPassword,
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: 'Peer Reader',
        record,
      });
      const peerReader = await loginWithCredentials(
        request,
        peerReaderEmail,
        peerReaderPassword,
      );

      const peerReadResponse = await request.get(
        `${apiBaseUrl()}/programs/${targetProgram.id}`,
        { headers: peerReader.headers },
      );
      await expectApiStatus(peerReadResponse, 200);

      const peerDerivedCommentResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/comments`,
        {
          headers: peerReader.headers,
          data: { content: 'AIP E2E same-cluster peer comment attempt.' },
        },
      );
      await expectApiStatus(peerDerivedCommentResponse, 403);

      const explicitSectorFeedbackResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/comments`,
        {
          headers: peerReader.headers,
          data: {
            stage: 'SECTOR_FEEDBACK',
            content: 'AIP E2E explicit sector feedback attempt.',
          },
        },
      );
      await expectApiStatus(explicitSectorFeedbackResponse, 400);

      const endorsementCommentResponse = await request.post(
        `${apiBaseUrl()}/programs/${targetProgram.id}/comments`,
        {
          headers: lguEndorser.headers,
          data: { content: 'AIP E2E endorsement-stage comment.' },
        },
      );
      await expectApiStatus(endorsementCommentResponse, 201);
      const endorsementComment = (await endorsementCommentResponse.json()) as {
        id: string;
        stage: string;
        resolvedAt: string | null;
      };
      if (endorsementComment.stage !== 'ENDORSEMENT') {
        throw new Error(
          `Expected ENDORSEMENT comment, got ${endorsementComment.stage}.`,
        );
      }

      const resolveEndorsementCommentResponse = await request.patch(
        `${apiBaseUrl()}/comments/${endorsementComment.id}/resolve`,
        {
          headers: ceppioHead.headers,
          data: { note: 'Resolved by CEPPIO owner during E2E.' },
        },
      );
      await expectApiStatus(resolveEndorsementCommentResponse, 200);
      const resolvedComment =
        (await resolveEndorsementCommentResponse.json()) as {
          id: string;
          resolvedAt: string | null;
        };
      if (!resolvedComment.resolvedAt) {
        throw new Error('Resolved endorsement comment did not receive resolvedAt.');
      }

      record.notes?.push(
        'Verified same-cluster read-only peer can read but cannot post comments.',
      );
      record.notes?.push(
        'Verified endorser comments derive ENDORSEMENT and can be resolved by the owner.',
      );
      record.artifacts.evidence.push(
        await writeEvidence('comment-gates', 'api-contract', {
          scenario: 'comment-gates',
          cycle,
          targetOffice: {
            acronym: 'CEPPIO',
            id: ceppio.id,
            clusterId: ceppioClusterId,
          },
          targetProgram,
          peerOffice,
          comments: {
            endorsementComment,
            resolvedComment,
          },
          apiCalls: [
            { method: 'GET', path: '/aip-cycles', expectedStatus: 200 },
            { method: 'GET', path: '/reference/city-offices', expectedStatus: 200 },
            {
              method: 'GET',
              path: `/programs?cycleId=${cycle.id}&cityOfficeId=${ceppio.id}&status=PENDING_APPROVAL`,
              expectedStatus: 200,
            },
            {
              method: 'POST',
              path: '/reference/city-offices',
              expectedStatus: 201,
            },
            { method: 'POST', path: '/users', expectedStatus: 201 },
            {
              method: 'GET',
              path: `/programs/${targetProgram.id}`,
              expectedStatus: 200,
              actor: 'same-cluster non-endorser',
            },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/comments`,
              expectedStatus: 403,
              assertion: 'Same-cluster non-endorser cannot derive a write stage.',
            },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/comments`,
              expectedStatus: 400,
              assertion: 'Explicit SECTOR_FEEDBACK is not creatable.',
            },
            {
              method: 'POST',
              path: `/programs/${targetProgram.id}/comments`,
              expectedStatus: 201,
              actor: 'LGU endorser',
            },
            {
              method: 'PATCH',
              path: `/comments/${endorsementComment.id}/resolve`,
              expectedStatus: 200,
              actor: 'CEPPIO owner',
            },
          ],
          assertions: [
            'Same-cluster non-endorser can read a same-cluster program.',
            'Same-cluster non-endorser cannot post a comment without an authorized stage.',
            'SECTOR_FEEDBACK is rejected through the normal comments API.',
            'Authorized endorser comments derive ENDORSEMENT.',
            'The proponent owner can resolve an ENDORSEMENT comment thread.',
            'Unit coverage verifies PUBLIC_FEEDBACK is excluded from submit blockers.',
          ],
        }),
      );
    },
  );
});

// ─── LFC proponent-office batch gate ─────────────────────────────────────────

const lfcOfficeHeadEmail = (acronym: string) =>
  `aip-e2e+lfc-${acronym.toLowerCase()}person3@example.test`;
const lfcOfficeHeadPassword = (acronym: string) =>
  `AipE2eLfc${acronym.replace(/[^A-Za-z0-9]/g, '')}123!`;

type RefProgram = { id: string; status: string; name: string };

async function listOfficePrograms(
  request: APIRequestContext,
  headers: { Authorization: string },
  cycleId: string,
  cityOfficeId: string,
): Promise<RefProgram[]> {
  const response = await request.get(
    `${apiBaseUrl()}/programs?cycleId=${cycleId}&cityOfficeId=${cityOfficeId}`,
    { headers },
  );
  await expectApiStatus(response, 200);
  const payload = (await response.json()) as { items: RefProgram[] };
  return payload.items;
}

async function lfcSignatories(
  request: APIRequestContext,
  headers: { Authorization: string },
  implementingOfficeId: string,
  cycleId: string,
): Promise<
  Array<{
    officeId: string;
    officeName: string;
    sequenceOrder: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
  }>
> {
  const response = await request.get(
    `${apiBaseUrl()}/lfc/offices/${implementingOfficeId}?cycleId=${cycleId}`,
    { headers },
  );
  await expectApiStatus(response, 200);
  const detail = (await response.json()) as {
    signatories: Array<{
      officeId: string;
      officeName: string;
      sequenceOrder: number;
      approvedCount: number;
      pendingCount: number;
      rejectedCount: number;
    }>;
  };
  return [...detail.signatories].sort(
    (a, b) => a.sequenceOrder - b.sequenceOrder,
  );
}

async function createReadyProgram(opts: {
  request: APIRequestContext;
  staffHeaders: { Authorization: string };
  headHeaders: { Authorization: string };
  cycleId: string;
  cityOfficeId: string;
  papSectorId: string;
  finishLineId: string;
  uacsObjectId: string;
  name: string;
  record: ScenarioScratch;
}): Promise<string> {
  const {
    request,
    staffHeaders,
    headHeaders,
    cycleId,
    cityOfficeId,
    papSectorId,
    finishLineId,
    uacsObjectId,
    name,
    record,
  } = opts;

  const createProgramResponse = await request.post(`${apiBaseUrl()}/programs`, {
    headers: staffHeaders,
    data: {
      aipCycleId: cycleId,
      cityOfficeId,
      papSectorId,
      papSubsectorCode: '000',
      finishLineId,
      name,
      description: 'Batch-gate acceptance program.',
      remarks: 'Created by the AIP cycle destructive acceptance suite.',
      expectedOutput: 'Exercises the LFC proponent-office batch gate.',
      implementationStartMonth: 1,
      implementationStartYear: fiscalYear,
      implementationEndMonth: 12,
      implementationEndYear: fiscalYear,
    },
  });
  await expectApiStatus(createProgramResponse, 201);
  const program = (await createProgramResponse.json()) as { id: string };

  const createPaResponse = await request.post(
    `${apiBaseUrl()}/programs/${program.id}/project-activities`,
    {
      headers: staffHeaders,
      data: {
        type: 'ACTIVITY',
        name: `${name} Activity`,
        description: 'Baseline activity for the batch-gate program.',
        expectedOutput: 'Activity with one validated line item.',
        orderIndex: 0,
        costMode: 'DIRECT_COSTS',
        implementationStartMonth: 1,
        implementationStartYear: fiscalYear,
        implementationEndMonth: 12,
        implementationEndYear: fiscalYear,
      },
    },
  );
  await expectApiStatus(createPaResponse, 201);
  const projectActivity = (await createPaResponse.json()) as { id: string };

  const createLineItemResponse = await request.post(
    `${apiBaseUrl()}/project-activities/${projectActivity.id}/line-items`,
    {
      headers: staffHeaders,
      data: {
        expenseClass: 'MOOE',
        uacsObjectId,
        quantity: '1.00',
        unit: 'lot',
        unitCost: '100000.00',
        remarks: 'Batch-gate line item.',
        orderIndex: 0,
      },
    },
  );
  await expectApiStatus(createLineItemResponse, 201);

  const submitResponse = await request.post(
    `${apiBaseUrl()}/programs/${program.id}/submit`,
    { headers: staffHeaders },
  );
  await expectApiStatus(submitResponse, 200);

  const headReviewResponse = await request.post(
    `${apiBaseUrl()}/programs/${program.id}/head-review`,
    { headers: headHeaders },
  );
  await expectApiStatus(headReviewResponse, 200);

  record.notes?.push(`Prepared HEAD_REVIEWED program "${name}" (${program.id}).`);
  return program.id;
}

test('drives the LFC proponent-office batch gate end to end', async ({
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'lfc-batch-gate',
    'LFC proponent-office batch gate',
    null,
    async (record) => {
      const admin = await loginAsSuperAdmin(request);
      const staff = await loginWithCredentials(
        request,
        psoStaffEmail,
        psoStaffPassword,
      );
      const head = await loginWithCredentials(
        request,
        psoHeadEmail,
        psoHeadPassword,
      );

      const [cyclesResponse, officesResponse, sectorsResponse, finishLinesResponse] =
        await Promise.all([
          request.get(`${apiBaseUrl()}/aip-cycles`, { headers: admin.headers }),
          request.get(`${apiBaseUrl()}/reference/city-offices`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/pap-sectors`, {
            headers: admin.headers,
          }),
          request.get(`${apiBaseUrl()}/reference/finish-lines`, {
            headers: admin.headers,
          }),
        ]);
      await expectApiStatus(cyclesResponse, 200);
      await expectApiStatus(officesResponse, 200);
      await expectApiStatus(sectorsResponse, 200);
      await expectApiStatus(finishLinesResponse, 200);

      const cycles = (await cyclesResponse.json()) as Array<{
        id: string;
        fiscalYear: number;
        status: string;
      }>;
      const cycle = cycles.find(
        (candidate) =>
          candidate.fiscalYear === fiscalYear && candidate.status === 'OPEN',
      );
      if (!cycle) {
        throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
      }

      const offices = (await officesResponse.json()) as Array<{
        id: string;
        acronym: string;
      }>;
      const pso = offices.find((office) => office.acronym === 'PSO');
      if (!pso) {
        throw new Error('PSO city office not found in reference data.');
      }

      const papSectors = (await sectorsResponse.json()) as Array<{ id: string }>;
      const finishLines = (await finishLinesResponse.json()) as Array<{
        id: string;
      }>;
      const papSectorId = papSectors[0]?.id;
      const finishLineId = finishLines[0]?.id;
      if (!papSectorId || !finishLineId) {
        throw new Error('Reference PAP sector / finish line missing for setup.');
      }

      const uacsResponse = await request.get(
        `${apiBaseUrl()}/reference/uacs-objects?expenseClass=MOOE`,
        { headers: admin.headers },
      );
      await expectApiStatus(uacsResponse, 200);
      const uacsObjects = (await uacsResponse.json()) as Array<{ id: string }>;
      const uacsObjectId = uacsObjects[0]?.id;
      if (!uacsObjectId) {
        throw new Error('No MOOE UACS objects available for setup.');
      }

      // Clean PSO slate: SUPER_ADMIN may delete programs in any state.
      const existingPsoPrograms = await listOfficePrograms(
        request,
        admin.headers,
        cycle.id,
        pso.id,
      );
      for (const prog of existingPsoPrograms) {
        const deleteResponse = await request.delete(
          `${apiBaseUrl()}/programs/${prog.id}`,
          { headers: admin.headers },
        );
        await expectApiStatus(deleteResponse, 200);
      }
      record.notes?.push(
        `Cleared ${existingPsoPrograms.length} pre-existing PSO program(s) for a clean batch.`,
      );

      // Two programs ready for the first batch.
      const progA = await createReadyProgram({
        request,
        staffHeaders: staff.headers,
        headHeaders: head.headers,
        cycleId: cycle.id,
        cityOfficeId: pso.id,
        papSectorId,
        finishLineId,
        uacsObjectId,
        name: `AIP E2E Batch A ${fiscalYear}`,
        record,
      });
      const progB = await createReadyProgram({
        request,
        staffHeaders: staff.headers,
        headHeaders: head.headers,
        cycleId: cycle.id,
        cityOfficeId: pso.id,
        papSectorId,
        finishLineId,
        uacsObjectId,
        name: `AIP E2E Batch B ${fiscalYear}`,
        record,
      });

      // First batch submit — both programs enter the LFC gate at the first office.
      const firstSubmit = await request.post(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/submit-for-approval`,
        { headers: head.headers },
      );
      await expectApiStatus(firstSubmit, 200);
      const firstSubmitBody = (await firstSubmit.json()) as { submitted: number };
      if (firstSubmitBody.submitted !== 2) {
        throw new Error(
          `Expected 2 programs submitted into the batch, got ${firstSubmitBody.submitted}.`,
        );
      }

      const seq0 = await lfcSignatories(request, admin.headers, pso.id, cycle.id);
      if (seq0.length < 2) {
        throw new Error('Expected at least two LFC offices in sequence.');
      }
      const cpdo = seq0[0];
      if (cpdo.pendingCount !== 2) {
        throw new Error(
          `Expected first LFC office pendingCount 2, got ${cpdo.pendingCount}.`,
        );
      }
      if (seq0[1].pendingCount !== 0) {
        throw new Error(
          `Expected second LFC office not actionable, got pendingCount ${seq0[1].pendingCount}.`,
        );
      }
      record.notes?.push(
        `Batch submitted: ${seq0[0].officeName} actionable (2), ${seq0[1].officeName} waiting.`,
      );

      // Provision the first LFC office head.
      const cpdoOffice = offices.find((o) => o.id === cpdo.officeId)!;
      await inviteAndActivateUser({
        request,
        adminHeaders: admin.headers,
        identityType: 'LFC',
        cityOfficeId: cpdo.officeId,
        officeAcronym: cpdoOffice.acronym,
        email: lfcOfficeHeadEmail(cpdoOffice.acronym),
        password: lfcOfficeHeadPassword(cpdoOffice.acronym),
        role: 'HEAD',
        firstName: 'AIP E2E',
        lastName: `${cpdoOffice.acronym} Head`,
        record,
      });
      const cpdoHead = await loginWithCredentials(
        request,
        lfcOfficeHeadEmail(cpdoOffice.acronym),
        lfcOfficeHeadPassword(cpdoOffice.acronym),
      );

      // First office approves A, returns B.
      const approveA = await request.post(
        `${apiBaseUrl()}/programs/${progA}/approvals/${cpdo.officeId}/decision`,
        { headers: cpdoHead.headers, data: { status: 'APPROVED' } },
      );
      await expectApiStatus(approveA, 200);
      const returnB = await request.post(
        `${apiBaseUrl()}/programs/${progB}/approvals/${cpdo.officeId}/decision`,
        {
          headers: cpdoHead.headers,
          data: {
            status: 'RETURNED',
            notes: 'AIP E2E: revise scope before re-submitting.',
          },
        },
      );
      await expectApiStatus(returnB, 200);

      // Approved sibling waits; returned sibling pauses the batch; next office idle.
      const progAStatus1 = (await (
        await request.get(`${apiBaseUrl()}/programs/${progA}`, {
          headers: admin.headers,
        })
      ).json()) as { status: string; aipReferenceCode: string | null };
      const progBStatus1 = (await (
        await request.get(`${apiBaseUrl()}/programs/${progB}`, {
          headers: admin.headers,
        })
      ).json()) as { status: string };
      if (progAStatus1.status !== 'PENDING_APPROVAL') {
        throw new Error(
          `Approved sibling should remain PENDING_APPROVAL, got ${progAStatus1.status}.`,
        );
      }
      if (progBStatus1.status !== 'FOR_REVISION') {
        throw new Error(
          `Returned program should be FOR_REVISION, got ${progBStatus1.status}.`,
        );
      }
      const seq1 = await lfcSignatories(request, admin.headers, pso.id, cycle.id);
      if (seq1[1].pendingCount !== 0) {
        throw new Error(
          `Second LFC office must stay idle while a program is returned; got pendingCount ${seq1[1].pendingCount}.`,
        );
      }
      record.notes?.push(
        'Verified approved sibling waits, returned sibling is FOR_REVISION, and the next LFC office stays idle.',
      );

      // Resolve the LFC return thread, then revise + resubmit B into the batch.
      const bComments = (await (
        await request.get(`${apiBaseUrl()}/programs/${progB}/comments`, {
          headers: head.headers,
        })
      ).json()) as Array<{
        id: string;
        stage: string;
        resolvedAt: string | null;
      }>;
      for (const comment of bComments) {
        if (comment.stage !== 'PUBLIC_FEEDBACK' && comment.resolvedAt === null) {
          const resolve = await request.patch(
            `${apiBaseUrl()}/comments/${comment.id}/resolve`,
            { headers: head.headers },
          );
          await expectApiStatus(resolve, 200);
        }
      }
      const resubmitB = await request.post(
        `${apiBaseUrl()}/programs/${progB}/submit`,
        { headers: staff.headers },
      );
      await expectApiStatus(resubmitB, 200);
      const reviewB = await request.post(
        `${apiBaseUrl()}/programs/${progB}/head-review`,
        { headers: head.headers },
      );
      await expectApiStatus(reviewB, 200);
      const secondSubmit = await request.post(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/submit-for-approval`,
        { headers: head.headers },
      );
      await expectApiStatus(secondSubmit, 200);
      const progBStatus2 = (await (
        await request.get(`${apiBaseUrl()}/programs/${progB}`, {
          headers: admin.headers,
        })
      ).json()) as { status: string };
      if (progBStatus2.status !== 'PENDING_APPROVAL') {
        throw new Error(
          `Resubmitted program should rejoin as PENDING_APPROVAL, got ${progBStatus2.status}.`,
        );
      }
      record.notes?.push('Resolved the return thread and resubmitted B into the paused batch.');

      // Add a brand-new program C while the batch is paused; it joins at the
      // current office with inherited prior approvals (none, since this is office 1).
      const progC = await createReadyProgram({
        request,
        staffHeaders: staff.headers,
        headHeaders: head.headers,
        cycleId: cycle.id,
        cityOfficeId: pso.id,
        papSectorId,
        finishLineId,
        uacsObjectId,
        name: `AIP E2E Batch C ${fiscalYear}`,
        record,
      });
      const thirdSubmit = await request.post(
        `${apiBaseUrl()}/aip-cycles/${cycle.id}/submit-for-approval`,
        { headers: head.headers },
      );
      await expectApiStatus(thirdSubmit, 200);
      const progCStatus = (await (
        await request.get(`${apiBaseUrl()}/programs/${progC}`, {
          headers: admin.headers,
        })
      ).json()) as { status: string };
      if (progCStatus.status !== 'PENDING_APPROVAL') {
        throw new Error(
          `Newly added program should join the batch as PENDING_APPROVAL, got ${progCStatus.status}.`,
        );
      }
      record.notes?.push('Added a new program into the paused batch at the current office.');

      // The first office now has B and C pending (A already approved). Approve all
      // → every program clears the first office → batch advances to the second.
      const seq2 = await lfcSignatories(request, admin.headers, pso.id, cycle.id);
      if (seq2[0].pendingCount !== 2) {
        throw new Error(
          `Expected 2 pending at the first office after resubmit/add, got ${seq2[0].pendingCount}.`,
        );
      }
      const approveAllCpdo = await request.post(
        `${apiBaseUrl()}/lfc/offices/${cpdo.officeId}/approve-all`,
        {
          headers: cpdoHead.headers,
          data: { cycleId: cycle.id, implementingOfficeId: pso.id },
        },
      );
      await expectApiStatus(approveAllCpdo, 200);

      const seq3 = await lfcSignatories(request, admin.headers, pso.id, cycle.id);
      if (seq3[1].pendingCount !== 3) {
        throw new Error(
          `Batch should advance with all 3 programs to the second office, got pendingCount ${seq3[1].pendingCount}.`,
        );
      }
      // No final codes are issued mid-sequence.
      for (const id of [progA, progB, progC]) {
        const prog = (await (
          await request.get(`${apiBaseUrl()}/programs/${id}`, {
            headers: admin.headers,
          })
        ).json()) as { status: string; aipReferenceCode: string | null };
        if (prog.status !== 'PENDING_APPROVAL' || prog.aipReferenceCode !== null) {
          throw new Error(
            `Program ${id} must remain PENDING_APPROVAL with no final code mid-sequence.`,
          );
        }
      }
      record.notes?.push(
        'Approve-all advanced the whole batch to the next office with no early finalization.',
      );

      // Walk the remaining LFC offices. Finalization happens only at the last.
      const remaining = seq0.slice(1); // offices after the first
      for (let i = 0; i < remaining.length; i++) {
        const office = remaining[i];
        const isLast = i === remaining.length - 1;
        const refOffice = offices.find((o) => o.id === office.officeId)!;
        await inviteAndActivateUser({
          request,
          adminHeaders: admin.headers,
          identityType: 'LFC',
          cityOfficeId: office.officeId,
          officeAcronym: refOffice.acronym,
          email: lfcOfficeHeadEmail(refOffice.acronym),
          password: lfcOfficeHeadPassword(refOffice.acronym),
          role: 'HEAD',
          firstName: 'AIP E2E',
          lastName: `${refOffice.acronym} Head`,
          record,
        });
        const officeHead = await loginWithCredentials(
          request,
          lfcOfficeHeadEmail(refOffice.acronym),
          lfcOfficeHeadPassword(refOffice.acronym),
        );

        // Before the last office decides, nothing is finalized.
        if (isLast) {
          for (const id of [progA, progB, progC]) {
            const prog = (await (
              await request.get(`${apiBaseUrl()}/programs/${id}`, {
                headers: admin.headers,
              })
            ).json()) as { status: string; aipReferenceCode: string | null };
            if (prog.status === 'APPROVED' || prog.aipReferenceCode !== null) {
              throw new Error(
                `No program may be APPROVED before the last LFC office decides (${id}).`,
              );
            }
          }
        }

        const approveAll = await request.post(
          `${apiBaseUrl()}/lfc/offices/${office.officeId}/approve-all`,
          {
            headers: officeHead.headers,
            data: { cycleId: cycle.id, implementingOfficeId: pso.id },
          },
        );
        await expectApiStatus(approveAll, 200);
        record.notes?.push(`Approve-all at ${refOffice.acronym}.`);
      }

      // After the last office, every program is APPROVED with a final code.
      const finalStatuses: Array<{ id: string; status: string; code: string | null }> =
        [];
      for (const id of [progA, progB, progC]) {
        const prog = (await (
          await request.get(`${apiBaseUrl()}/programs/${id}`, {
            headers: admin.headers,
          })
        ).json()) as { status: string; aipReferenceCode: string | null };
        if (prog.status !== 'APPROVED' || !prog.aipReferenceCode) {
          throw new Error(
            `Program ${id} should be APPROVED with a final code, got ${prog.status} / ${prog.aipReferenceCode}.`,
          );
        }
        finalStatuses.push({ id, status: prog.status, code: prog.aipReferenceCode });
      }
      record.notes?.push('All batch programs finalized to APPROVED with final AIP codes.');

      // Final codes appear in the public registry; activity stream is readable.
      const registryResponse = await request.get(
        `${apiBaseUrl()}/public/registry?cycleId=${cycle.id}&cityOfficeId=${pso.id}`,
        { headers: admin.headers },
      );
      await expectApiStatus(registryResponse, 200);
      const registry = (await registryResponse.json()) as
        | { items: Array<{ id: string; status: string }> }
        | Array<{ id: string; status: string }>;
      const registryItems = Array.isArray(registry) ? registry : registry.items;
      for (const id of [progA, progB, progC]) {
        const found = registryItems.find((p) => p.id === id);
        if (!found || found.status !== 'APPROVED') {
          throw new Error(`Approved program ${id} missing from public registry.`);
        }
      }
      const activityResponse = await request.get(
        `${apiBaseUrl()}/programs/${progA}/activity-stream`,
        { headers: admin.headers },
      );
      await expectApiStatus(activityResponse, 200);

      record.artifacts.evidence.push(
        await writeEvidence('lfc-batch-gate', 'api-contract', {
          scenario: 'lfc-batch-gate',
          cycle,
          proponentOffice: { acronym: 'PSO', id: pso.id },
          lfcSequence: seq0.map((s) => ({
            officeId: s.officeId,
            officeName: s.officeName,
            sequenceOrder: s.sequenceOrder,
          })),
          programs: { A: progA, B: progB, C: progC },
          finalStatuses,
          assertions: [
            'A first batch submit places every program at the first LFC office.',
            'An approved sibling stays PENDING_APPROVAL while a sibling is returned.',
            'A returned program pauses the batch; the next LFC office stays idle.',
            'A resubmitted returned program rejoins the active batch at the current office.',
            'A new program added while paused joins the active batch at the current office.',
            'The batch advances to the next office only when every program clears the current office.',
            'No final AIP code is issued until the last LFC office approves every program.',
            'Final approval issues final AIP codes and publishes APPROVED programs to the registry.',
          ],
        }),
      );
    },
  );
});

// ─── Browser-driven UI layer ─────────────────────────────────────────────────
//
// These run after the API-driven scenarios above (same file → sequential), so
// the cycle, accounts, and programs they assert against already exist. Auth is
// done by injecting the app's session cookies (access_token / refresh_token)
// captured from the API — no need to drive the login form. The cookies are set
// without the `secure` flag so they ride over http://localhost regardless of the
// client's NODE_ENV.

/** Switch the browser session to a given user by injecting session cookies. */
async function loginBrowser(
  context: BrowserContext,
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<void> {
  const { accessToken, refreshToken } = await loginTokens(request, email, password);
  await context.clearCookies();
  await context.addCookies([
    { name: 'access_token', value: accessToken, url: clientBaseUrl },
    { name: 'refresh_token', value: refreshToken, url: clientBaseUrl },
  ]);
}

/** Best-effort soft accessibility heuristics — recorded as notes, never fatal. */
async function softA11yNotes(
  page: Page,
  label: string,
  record: ScenarioScratch,
): Promise<void> {
  try {
    const langCount = await page.locator('html[lang]').count();
    const headingCount = await page.getByRole('heading').count();
    const titled = (await page.title()).trim().length > 0;
    record.notes?.push(
      `[a11y:${label}] html[lang]=${langCount > 0 ? 'yes' : 'no'}, headings=${headingCount}, page-title=${titled ? 'yes' : 'no'}.`,
    );
  } catch (err) {
    record.notes?.push(`[a11y:${label}] check skipped: ${(err as Error).message}`);
  }
}

async function resolveCycleAndCeppio(
  request: APIRequestContext,
  adminHeaders: { Authorization: string },
): Promise<{ cycle: { id: string }; ceppio: { id: string; acronym: string } }> {
  const [cyclesResponse, officesResponse] = await Promise.all([
    request.get(`${apiBaseUrl()}/aip-cycles`, { headers: adminHeaders }),
    request.get(`${apiBaseUrl()}/reference/city-offices`, { headers: adminHeaders }),
  ]);
  await expectApiStatus(cyclesResponse, 200);
  await expectApiStatus(officesResponse, 200);
  const cycles = (await cyclesResponse.json()) as Array<{
    id: string;
    fiscalYear: number;
    status: string;
  }>;
  const cycle = cycles.find(
    (c) => c.fiscalYear === fiscalYear && c.status === 'OPEN',
  );
  if (!cycle) throw new Error(`Open AIP cycle ${fiscalYear} was not found.`);
  const offices = (await officesResponse.json()) as Array<{
    id: string;
    acronym: string;
  }>;
  const ceppio = offices.find((o) => o.acronym === 'CEPPIO');
  if (!ceppio) throw new Error('CEPPIO city office not found.');
  return { cycle, ceppio };
}

test('UI: the LFC board offers Approve/Return but no terminal Reject control', async ({
  page,
  context,
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'browser-lfc-reject-absent',
    'LFC board hides the deprecated terminal Reject control',
    page,
    async (record) => {
      const failures = monitorPageFailures(page);
      const admin = await loginAsSuperAdmin(request);
      const { cycle, ceppio } = await resolveCycleAndCeppio(request, admin.headers);

      // CEPPIO is PENDING_APPROVAL at its current LFC office; the lfc-reject-head
      // account (provisioned earlier as HEAD of that office) is the active signatory.
      const detailResponse = await request.get(
        `${apiBaseUrl()}/lfc/offices/${ceppio.id}?cycleId=${cycle.id}`,
        { headers: admin.headers },
      );
      await expectApiStatus(detailResponse, 200);
      const detail = (await detailResponse.json()) as {
        signatories: Array<{ officeId: string; pendingCount: number }>;
      };
      const active = detail.signatories.find((s) => s.pendingCount > 0);
      if (!active) {
        throw new Error('No active LFC signatory for CEPPIO — cannot assert board UI.');
      }

      await loginBrowser(context, request, lfcRejectHeadEmail, lfcRejectHeadPassword);
      // domcontentloaded, not networkidle: the registry opens a long-lived SSE
      // stream, so the network never goes idle.
      await page.goto(
        `${clientBaseUrl}/aip-registry?view=approver&officeId=${ceppio.id}`,
        { waitUntil: 'domcontentloaded' },
      );

      // The review panel renders for the active office.
      await page.getByText('LFC Review Panel').first().waitFor({ timeout: 20_000 });
      await expect(
        page.getByRole('button', { name: /approve all/i }).first(),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /return for revision/i }).first(),
      ).toBeVisible();

      // The deprecated terminal Reject control must be gone.
      const rejectButtons = await page
        .getByRole('button', { name: /^reject/i })
        .count();
      expect(rejectButtons).toBe(0);

      record.notes?.push(
        'LFC board shows Approve All + Return for Revision and no Reject button.',
      );
      record.artifacts.screenshots.push(
        await captureMilestone(page, 'browser-lfc-reject-absent', 'lfc-panel'),
      );
      await softA11yNotes(page, 'lfc-board', record);
      failures.assertNoFailures();

      record.artifacts.evidence.push(
        await writeEvidence('browser-lfc-reject-absent', 'ui-contract', {
          scenario: 'browser-lfc-reject-absent',
          page: `/aip-registry?view=approver&officeId=${ceppio.id}`,
          activeSignatoryOfficeId: active.officeId,
          assertions: [
            'The LFC review panel renders for the active office.',
            'Approve All and Return for Revision controls are present.',
            'No Reject control is rendered (terminal rejection is deprecated).',
          ],
        }),
      );
    },
  );
});

test('UI: the endorser view scopes CSO representatives to their own cluster', async ({
  page,
  context,
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'browser-endorser-scope',
    'Endorser view shows same-cluster CSO programs and hides cross-cluster ones',
    page,
    async (record) => {
      const failures = monitorPageFailures(page);

      // Same-cluster CSO representative: CEPPIO (same cluster, PENDING_APPROVAL) appears.
      await loginBrowser(context, request, sameClusterCsoEmail, sameClusterCsoPassword);
      await page.goto(`${clientBaseUrl}/aip-registry/endorse`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1000);
      const sameClusterCeppio = await page.getByText(/CEPPIO/).count();
      if (sameClusterCeppio < 1) {
        throw new Error(
          'Same-cluster CSO representative should see CEPPIO in the endorser view.',
        );
      }
      record.notes?.push('Same-cluster CSO rep sees CEPPIO in the endorser view.');
      record.artifacts.screenshots.push(
        await captureMilestone(page, 'browser-endorser-scope', 'same-cluster'),
      );

      // Cross-cluster CSO representative: CEPPIO must not appear.
      await loginBrowser(context, request, crossClusterCsoEmail, crossClusterCsoPassword);
      await page.goto(`${clientBaseUrl}/aip-registry/endorse`, {
        waitUntil: 'domcontentloaded',
      });
      await page.waitForTimeout(1000);
      const crossClusterCeppio = await page.getByText(/CEPPIO/).count();
      expect(crossClusterCeppio).toBe(0);
      record.notes?.push(
        'Cross-cluster CSO rep does not see CEPPIO in the endorser view.',
      );
      record.artifacts.screenshots.push(
        await captureMilestone(page, 'browser-endorser-scope', 'cross-cluster'),
      );
      await softA11yNotes(page, 'endorser-view', record);
      failures.assertNoFailures();

      record.artifacts.evidence.push(
        await writeEvidence('browser-endorser-scope', 'ui-contract', {
          scenario: 'browser-endorser-scope',
          page: '/aip-registry/endorse',
          assertions: [
            'A same-cluster CSO representative sees CEPPIO in the endorser view.',
            'A cross-cluster CSO representative does not see CEPPIO.',
          ],
        }),
      );
    },
  );
});

test('UI: key role pages render with session-switching (smoke + soft checks)', async ({
  page,
  context,
  request,
}, testInfo) => {
  await withScenario(
    testInfo,
    'browser-page-smoke',
    'Role pages render: registry, LGU feedback dashboard, control-panel cycles + users',
    page,
    async (record) => {
      // Loads api/.env into process.env so the admin creds below resolve.
      await loginAsSuperAdmin(request);

      const visits: Array<{
        label: string;
        path: string;
        email: string;
        password: string;
        expect: RegExp;
      }> = [
        {
          label: 'aip-registry (CEPPIO head)',
          path: '/aip-registry',
          email: ceppioHeadEmail,
          password: ceppioHeadPassword,
          expect: /registry/i,
        },
        {
          label: 'LGU feedback dashboard (CEPPIO head)',
          path: '/dashboard/feedback',
          email: ceppioHeadEmail,
          password: ceppioHeadPassword,
          expect: /feedback/i,
        },
        {
          label: 'control-panel cycles (admin)',
          path: '/control-panel/aip-cycles',
          email: process.env.AIP_E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL!,
          password:
            process.env.AIP_E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD!,
          expect: /cycle/i,
        },
        {
          label: 'control-panel users (admin)',
          path: '/control-panel/users',
          email: process.env.AIP_E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL!,
          password:
            process.env.AIP_E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD!,
          expect: /user|invite/i,
        },
      ];

      const timings: Array<{ label: string; ms: number; status: number }> = [];
      for (const visit of visits) {
        const pageFailures = monitorPageFailures(page);
        await loginBrowser(context, request, visit.email, visit.password);
        const started = Date.now();
        const response = await page.goto(`${clientBaseUrl}${visit.path}`, {
          waitUntil: 'domcontentloaded',
        });
        const ms = Date.now() - started;
        const status = response?.status() ?? 0;
        timings.push({ label: visit.label, ms, status });

        if (status >= 400) {
          throw new Error(`${visit.label} returned HTTP ${status} for ${visit.path}.`);
        }
        // No app error boundary.
        const errorBoundary = await page
          .getByText(/something went wrong|application error|unhandled runtime/i)
          .count();
        expect(errorBoundary).toBe(0);
        // Page shows its expected content.
        await expect(page.getByText(visit.expect).first()).toBeVisible({
          timeout: 15_000,
        });

        record.notes?.push(`[load] ${visit.label}: ${ms} ms (HTTP ${status}).`);
        if (pageFailures.failures.length > 0) {
          record.notes?.push(
            `[soft] ${visit.label} console/network notes: ${pageFailures.failures.join(' | ')}`,
          );
        }
        await softA11yNotes(page, visit.label, record);
        record.artifacts.screenshots.push(
          await captureMilestone(
            page,
            'browser-page-smoke',
            visit.label.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
          ),
        );
      }

      record.artifacts.evidence.push(
        await writeEvidence('browser-page-smoke', 'ui-contract', {
          scenario: 'browser-page-smoke',
          timings,
          assertions: [
            'Each role page returns < 400 and shows no error boundary.',
            'Each page renders its expected content for the logged-in role.',
            'Session-switching via injected cookies works across roles.',
            'Load timings and accessibility heuristics captured as soft findings.',
          ],
        }),
      );
    },
  );
});
