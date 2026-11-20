/**
 * Full authoring workflow, driven through the real UI as SUPER_ADMIN.
 *
 *   create program → create project → create activity → publish → edit ×3
 *
 * in both orders: edits while DRAFT (publish last), and edits inside a
 * PUBLISHED_REVISION opened after publishing.
 *
 * Run explicitly — the default config's testDir picks up the destructive
 * aip-cycle suite too:
 *   cd client && pnpm exec playwright test e2e/workflow/full-workflow.spec.ts --project=chromium
 *
 * Requires `pnpm dev:api` (:8000) and `pnpm dev:client` (:3000) already running.
 * Every program it creates is deleted in afterAll — see helpers.ts.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import {
  API_BASE,
  RUN_ID,
  TEST_PREFIX,
  chooseFromMultiSelect,
  chooseFromSelect,
  createdProgramIds,
  deleteProgram,
  loginBrowserAsSuperAdmin,
  programProjectActivities,
  programStatus,
  superAdmin,
  sweepTestPrograms,
  testProgramName,
  trackProgram,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, request }) => {
  // Each test walks ~10 full page loads against a remote (Supabase) database;
  // the config's 60s default expires mid-flow.
  test.setTimeout(300_000);
  await loginBrowserAsSuperAdmin(context, request);
});

test.afterAll(async ({ request }) => {
  if (createdProgramIds.length === 0) return;
  const auth = await superAdmin(request);
  const failures: string[] = [];
  for (const id of createdProgramIds) {
    try {
      await deleteProgram(request, auth, id);
    } catch (err) {
      failures.push(`${id}: ${(err as Error).message}`);
    }
  }
  createdProgramIds.length = 0;
  if (failures.length) {
    throw new Error(`TEARDOWN LEFT LIVE TEST DATA:\n${failures.join('\n')}`);
  }
});

test('preflight — API reachable, super admin can log in, an OPEN cycle exists', async ({
  request,
  page,
}) => {
  const auth = await superAdmin(request);

  const cycles = await request.get(`${API_BASE}/aip-cycles`, { headers: auth.headers });
  expect(cycles.ok(), `GET /aip-cycles → ${cycles.status()}`).toBeTruthy();
  const cycleBody = (await cycles.json()) as
    | Array<{ id: string; fiscalYear: number; status: string }>
    | { data: Array<{ id: string; fiscalYear: number; status: string }> };
  const cycleRows = Array.isArray(cycleBody) ? cycleBody : cycleBody.data;
  const open = cycleRows.find((c) => c.status === 'OPEN');
  expect(
    open,
    `No OPEN AIP cycle — program creation is impossible. Cycles: ${cycleRows
      .map((c) => `${c.fiscalYear}:${c.status}`)
      .join(', ')}`,
  ).toBeTruthy();
  console.log(`[preflight] open cycle FY${open!.fiscalYear} (${open!.id})`);

  // The browser session must actually be authenticated, not bounced to /login.
  await page.goto('/programs/new', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/programs\/new$/);
  await expect(page.getByRole('heading', { name: /program identity/i })).toBeVisible();
});

// ─── Step helpers, written against the real components ───────────────────────

/**
 * Fill and submit `/programs/new`, returning the new program's id.
 *
 * As SUPER_ADMIN there is no own-org, so the multi-select labelled
 * "Implementing Office / Organization" *is* the implementing-office picker and
 * its first entry drives both the sector and the AIP code
 * (`new-program-form.tsx` `isSuperAdmin`).
 */
async function createProgram(page: Page, name: string): Promise<string> {
  await page.goto('/programs/new', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /program identity/i })).toBeVisible();

  // Reference data has to land before the office picker is usable.
  await expect(page.locator('[aria-haspopup="listbox"]').first()).toBeVisible();
  await expect(page.getByText('Loading offices…')).toHaveCount(0, { timeout: 30_000 });

  await chooseFromSelect(page, 'papClass', { first: true });
  await page.locator('#programName').fill(name);

  await chooseFromMultiSelect(page, {
    searchPlaceholder: 'Search offices…',
    query: 'CMO',
    // Substring is unique: "Office of the City Vice Mayor" does not contain it.
    hasText: 'Office of the City Mayor',
  });

  // The regression guard for the sector/AIP-code dead-end: picking an office
  // with a PAP sector on file must auto-fill both, unprompted.
  await expect(page.getByText('Pending office selection')).toHaveCount(0, { timeout: 15_000 });
  const aipCode = page.locator('text=/^\\d{4}-/').first();
  await expect(aipCode).toBeVisible({ timeout: 15_000 });

  await chooseFromSelect(page, 'primaryClusterId', { first: true });

  // The implementation period is pre-seeded from the cycle's fiscal year, so it
  // only needs asserting, not filling.
  await expect(page.locator('#implementationStart')).not.toContainText('Select start');
  await expect(page.locator('#implementationEnd')).not.toContainText('Select end');

  await page.getByRole('button', { name: /^Save Program$/ }).click();

  // Creation deliberately does not redirect — it toasts, and the toast's action
  // is the only UI path to the new program's id.
  const addProject = page.getByRole('button', { name: /^Add Project$/ });
  await expect(addProject).toBeVisible({ timeout: 30_000 });
  await addProject.click();
  // Soft (History API) navigation — poll the URL rather than waiting on a
  // 'load' event that a client-side router.push never fires.
  await expect(page).toHaveURL(/\/programs\/[^/]+\/add-project/, { timeout: 30_000 });

  const id = page.url().match(/\/programs\/([^/]+)\/add-project/)![1];
  trackProgram(id);
  return id;
}

/** Create the PA on whatever add-project/add-activity page is already open. */
async function fillProjectActivity(
  page: Page,
  opts: { name: string; kind: 'project' | 'activity'; costMode?: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN' },
): Promise<void> {
  await expect(page.locator('#projectActivityName')).toBeVisible({ timeout: 30_000 });

  if (opts.kind === 'project') {
    await page.getByRole('button', { name: /^Project Major component/ }).click();
    if (opts.costMode === 'ACTIVITY_CHILDREN') {
      // Cost structure is a Base UI ui/select, not the cmdk popover the rest of
      // the form uses. Its trigger must read the label, not the raw enum.
      const costStructure = page.getByRole('combobox');
      await expect(costStructure).toContainText('Direct Costs');
      await costStructure.click();
      await page.getByRole('option', { name: /Activity-Derived Costs/ }).click();
      await expect(costStructure).toContainText('Activity-Derived Costs');
      await expect(page.getByText(/summed from its child activities/i)).toBeVisible();
    }
  }

  await page.locator('#projectActivityName').fill(opts.name);

  // PS/MOOE/CO and fund sources only exist when this PA carries its own costs;
  // an ACTIVITY_CHILDREN parent sums them from its children instead.
  const carriesCosts = !(opts.kind === 'project' && opts.costMode === 'ACTIVITY_CHILDREN');
  if (carriesCosts) {
    await page.getByRole('button', { name: 'Select one or more funds…' }).click();
    await page.getByRole('option').first().click();
    await page.keyboard.press('Escape');
    await page.locator('#mooeEstimate').fill('250000.00');
    await page.locator('#mooeEstimate').blur();
  }

  const label = opts.kind === 'project' ? 'Save Project' : 'Save Activity';
  await page.getByRole('button', { name: new RegExp(`^${label}$`) }).click();

  const kindLabel = opts.kind === 'project' ? 'Project' : 'Activity';
  await expect(
    page.getByRole('heading', { name: `${kindLabel} Created Successfully` }),
  ).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Return to Registry$/ }).click();
  await expect(page).toHaveURL(/\/aip-registry/, { timeout: 30_000 });
}

/** Find a program in the registry by its run id and open its overview drawer. */
async function openProgramDrawer(page: Page, runId: string): Promise<void> {
  await page.goto('/aip-registry', { waitUntil: 'domcontentloaded' });
  const search = page.getByPlaceholder('Search PPAs, codes, or finish lines');
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill(runId);
  const view = page.getByRole('button', { name: 'View program' }).first();
  await expect(view).toBeVisible({ timeout: 30_000 });
  await view.click();
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 30_000 });
}

/** Click a publish-panel button and confirm the AlertDialog it opens. */
async function confirmPanelAction(page: Page, button: RegExp): Promise<void> {
  const trigger = page.getByRole('button', { name: button });
  await expect(trigger).toBeEnabled({ timeout: 30_000 });
  await trigger.click();
  const confirm = page.getByRole('button', { name: /^(Confirm|Working…)$/ });
  await expect(confirm).toBeVisible({ timeout: 15_000 });
  await confirm.click();
}

async function editEntityName(
  page: Page,
  url: string,
  fieldId: string,
  saveButton: RegExp,
  newName: string,
): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const field = page.locator(`#${fieldId}`);
  await expect(field).toBeVisible({ timeout: 30_000 });
  // Prefill is part of the contract — an empty edit form silently wipes fields.
  await expect(field).not.toHaveValue('');
  await field.fill(newName);
  await page.getByRole('button', { name: saveButton }).click();
  await expectSaveRedirect(page);
}

/**
 * Wait for a save to land on the registry, but surface the form's own error
 * instead of a bare navigation timeout — "Save failed: ceiling exceeded" is a
 * usable bug report, "waiting for navigation" is not.
 */
async function expectSaveRedirect(page: Page): Promise<void> {
  try {
    // The program edit page shows a success banner and redirects 2s later, so
    // the banner is not a failure signal — only a missing redirect is.
    await expect(page).toHaveURL(/\/aip-registry/, { timeout: 30_000 });
  } catch {
    const messages = (await page.locator('[role="alert"]').allInnerTexts())
      .map((t) => t.trim())
      .filter(Boolean)
      .join(' | ');
    throw new Error(
      `Save did not redirect to the registry (still at ${page.url()}). Alerts on page: ${messages || '(none)'}`,
    );
  }
}

/** Steps 1-3, shared by both orderings. */
async function buildProgramWithChildren(
  page: Page,
  request: APIRequestContext,
  label: string,
): Promise<{ programId: string; projectId: string; activityId: string; name: string }> {
  const auth = await superAdmin(request);
  const name = testProgramName(label);

  const programId = await createProgram(page, name);
  await fillProjectActivity(page, {
    name: `${TEST_PREFIX} ${label} project`,
    kind: 'project',
    costMode: 'ACTIVITY_CHILDREN',
  });

  const afterProject = await programProjectActivities(request, auth, programId);
  const project = afterProject.find((pa) => pa.type === 'PROJECT');
  expect(project, 'project was not created').toBeTruthy();

  await page.goto(`/projects/${project!.id}/add-activity`, { waitUntil: 'domcontentloaded' });
  await fillProjectActivity(page, {
    name: `${TEST_PREFIX} ${label} activity`,
    kind: 'activity',
  });

  const afterActivity = await programProjectActivities(request, auth, programId);
  const activity = afterActivity.find((pa) => pa.type === 'ACTIVITY');
  expect(activity, 'activity was not created').toBeTruthy();

  // Publish refuses any PA with a zero proposed budget, so the parent must have
  // rolled its child's cost up by now.
  expect(Number(activity!.proposedBudget)).toBeGreaterThan(0);

  return { programId, projectId: project!.id, activityId: activity!.id, name };
}

test('A — create program, project, activity; edit all three as DRAFT; publish last', async ({
  page,
  request,
}) => {
  const auth = await superAdmin(request);
  const { programId, projectId, activityId } = await buildProgramWithChildren(page, request, 'A');

  expect(await programStatus(request, auth, programId)).toBe('DRAFT');

  await editEntityName(
    page,
    `/programs/${programId}/edit`,
    'programName',
    /^Save Changes$/,
    testProgramName('A EDITED'),
  );
  await editEntityName(
    page,
    `/projects/${projectId}/edit`,
    'projectActivityName',
    /^Save Project$/,
    `${TEST_PREFIX} A project EDITED`,
  );
  await editEntityName(
    page,
    `/activities/${activityId}/edit`,
    'projectActivityName',
    /^Save Activity$/,
    `${TEST_PREFIX} A activity EDITED`,
  );

  // Every edit must have reached the database, not just the toast.
  const program = await request.get(`${API_BASE}/programs/${programId}`, { headers: auth.headers });
  const body = (await program.json()) as {
    name: string;
    projectActivities: Array<{ id: string; name: string }>;
  };
  // Case-insensitive: the program form title-cases the name on blur
  // (`titleCaseName`), so "A EDITED" comes back as "a Edited".
  expect(body.name).toMatch(/a edited/i);
  expect(body.projectActivities.find((pa) => pa.id === projectId)!.name).toMatch(/project edited/i);
  expect(body.projectActivities.find((pa) => pa.id === activityId)!.name).toMatch(/activity edited/i);

  await openProgramDrawer(page, RUN_ID);
  await confirmPanelAction(page, /^Publish$/);
  await expect
    .poll(() => programStatus(request, auth, programId), { timeout: 30_000 })
    .toBe('PUBLISHED');
});

test('B — publish first, open a revision, then edit all three and republish', async ({
  page,
  request,
}) => {
  const auth = await superAdmin(request);
  const { programId, projectId, activityId } = await buildProgramWithChildren(page, request, 'B');

  await openProgramDrawer(page, RUN_ID);
  await confirmPanelAction(page, /^Publish$/);
  await expect
    .poll(() => programStatus(request, auth, programId), { timeout: 30_000 })
    .toBe('PUBLISHED');

  // PUBLISHED is not in EDITABLE_PROGRAM_STATUSES — the edit route must refuse.
  await page.goto(`/programs/${programId}/edit`, { waitUntil: 'domcontentloaded' });
  // `.` not `'` — the copy uses a typographic apostrophe (can’t).
  await expect(page.getByText(/can.t be edited right now/i)).toBeVisible({ timeout: 30_000 });

  await openProgramDrawer(page, RUN_ID);
  await confirmPanelAction(page, /^Edit this AIP$/);
  await expect
    .poll(() => programStatus(request, auth, programId), { timeout: 30_000 })
    .toBe('PUBLISHED_REVISION');

  await editEntityName(
    page,
    `/programs/${programId}/edit`,
    'programName',
    /^Save Changes$/,
    testProgramName('B REVISED'),
  );
  await editEntityName(
    page,
    `/projects/${projectId}/edit`,
    'projectActivityName',
    /^Save Project$/,
    `${TEST_PREFIX} B project REVISED`,
  );
  await editEntityName(
    page,
    `/activities/${activityId}/edit`,
    'projectActivityName',
    /^Save Activity$/,
    `${TEST_PREFIX} B activity REVISED`,
  );

  await openProgramDrawer(page, RUN_ID);
  await confirmPanelAction(page, /^Publish changes$/);
  await expect
    .poll(() => programStatus(request, auth, programId), { timeout: 30_000 })
    .toBe('PUBLISHED');

  const program = await request.get(`${API_BASE}/programs/${programId}`, { headers: auth.headers });
  const body = (await program.json()) as { name: string };
  expect(body.name).toMatch(/b revised/i);
});

/**
 * Runs last: deletes anything this suite has ever left behind — including from a
 * run that was killed before its afterAll — and asserts the registry is clean.
 * Also usable on its own:
 *   pnpm exec playwright test e2e/workflow/full-workflow.spec.ts -g "sweep"
 */
test('sweep — no test programs are left live in the database', async ({ request }) => {
  const auth = await superAdmin(request);
  const swept = await sweepTestPrograms(request, auth);
  if (swept.length) console.log(`[sweep] removed ${swept.length} stray test program(s)`);
  expect(await sweepTestPrograms(request, auth)).toEqual([]);
});
