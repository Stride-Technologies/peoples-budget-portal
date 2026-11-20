/**
 * Staff review and enact a budget document (specs/012 T059): a flagged row
 * blocks enacting until it is marked reviewed; once enacted the document is
 * frozen, and its history records both steps.
 */
import { test, expect } from '@playwright/test';
import { API_BASE, loginBrowserAsSuperAdmin, superAdmin } from '../workflow/helpers';
import {
  WRITES_ENABLED, WRITES_SKIP_REASON, createFy, createPrismaClient, draftOrdinance, removeFy,
} from './db-fixtures';

const FY = 2098; // one of helpers.ts FIXTURE_YEARS

test.describe('budget document review', () => {
  test.skip(!WRITES_ENABLED, WRITES_SKIP_REASON);
  const prisma = WRITES_ENABLED ? createPrismaClient() : null!;
  let doc: Awaited<ReturnType<typeof draftOrdinance>>;

  test.beforeAll(async () => {
    const { cycleId, officeId } = await createFy(prisma, FY);
    doc = await draftOrdinance(prisma, cycleId, officeId);
  });
  test.afterAll(async () => {
    await removeFy(prisma, FY);
    await prisma.$disconnect();
  });

  test('acknowledge → enact → frozen → history', async ({ page, context, request }) => {
    await loginBrowserAsSuperAdmin(context, request);
    await page.goto(`/budget-cycles/${FY}/documents/${doc.documentId}`);
    const enact = page.getByRole('button', { name: /Enact this Ordinance/ });
    await expect(enact).toBeDisabled();

    await page.getByRole('link', { name: /Import review/ }).click();
    await page.getByRole('button', { name: 'Mark reviewed' }).click();
    await expect(page.getByText('Every imported PPA has been reviewed.')).toBeVisible();
    await expect(enact).toBeEnabled();

    await enact.click();
    await page.getByRole('button', { name: 'Enact', exact: true }).click();
    await expect(enact).toHaveCount(0);
    await expect(page.getByText('Enacted', { exact: true }).first()).toBeVisible();

    // Frozen: the API refuses any further review on it.
    const api = await superAdmin(request);
    const refused = await request.post(
      `${API_BASE}/budget-documents/${doc.documentId}/items/${doc.childId}/acknowledge-import`,
      { headers: api.headers },
    );
    expect(refused.status()).toBe(409);

    await page.getByRole('link', { name: 'History' }).click();
    const history = page.getByRole('listitem');
    await expect(history.getByText('Finalized', { exact: true })).toBeVisible();
    await expect(history.getByText('Import warning reviewed', { exact: true })).toBeVisible();
  });
});
