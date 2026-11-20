/**
 * An Indicative Project becomes Final once the year's budget is enacted
 * (specs/012 T073): a line linked to an AIP program is relinked to the enacted
 * PPA that reuses the program's id, and the Final PPMP opens on its own page.
 */
import { test, expect } from '@playwright/test';
import { loginBrowserAsSuperAdmin, superAdmin } from '../workflow/helpers';
import {
  WRITES_ENABLED, WRITES_SKIP_REASON, aipProgram, createFy, createPrismaClient, draftOrdinance, removeFy,
} from './db-fixtures';

const FY = 2099; // one of helpers.ts FIXTURE_YEARS

test.describe('Final PPMP', () => {
  test.skip(!WRITES_ENABLED, WRITES_SKIP_REASON);
  const prisma = WRITES_ENABLED ? createPrismaClient() : null!;

  test.afterAll(async () => {
    await removeFy(prisma, FY);
    await prisma.$disconnect();
  });

  test('create Final relinks the line to the enacted PPA', async ({ page, context, request }) => {
    // The program's author is the signed-in admin (the token's subject), so the
    // fixture never reads the users table.
    const { accessToken } = await superAdmin(request);
    const userId = (JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()) as { sub: string }).sub;
    const { cycleId, officeId } = await createFy(prisma, FY);
    const programId = await aipProgram(prisma, cycleId, officeId, userId);
    // The enacted Ordinance's root PPA reuses the program's id (as FY2026 does).
    const doc = await draftOrdinance(prisma, cycleId, officeId, programId);
    await prisma.budgetItem.update({ where: { id: doc.childId }, data: { importWarnings: [] } });
    await prisma.budgetDocument.update({
      where: { id: doc.documentId },
      data: { status: 'ENACTED', finalizedAt: new Date() },
    });
    const uacs = await prisma.uACSObject.findFirstOrThrow({ select: { id: true, code: true, description: true } });
    const { id: ppmpId } = await prisma.pPMP.create({
      data: {
        officeId, aipCycleId: cycleId, name: 'E2E Indicative Project', fundingProgram: 'E2E program',
        lineItems: {
          create: [{
            lineItemName: 'E2E linked line', programId, uacsObjectId: uacs.id, uacsCode: uacs.code,
            uacsDescription: uacs.description, quantity: '1', unit: 'lot', unitCost: '100', lineTotal: '100',
            fundSource: 'GF', expenseClass: 'MOOE',
          }],
        },
      },
    });

    await loginBrowserAsSuperAdmin(context, request);
    await page.goto(`/ppmp-registry/${ppmpId}`);
    await expect(page.getByText('Indicative', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: /Create Final PPMP/ }).click();
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await page.waitForURL((u) => !u.pathname.endsWith(ppmpId));
    await expect(page.getByText('Final', { exact: true }).first()).toBeVisible();

    await page.getByRole('button', { name: 'View' }).first().click();
    const picker = page.locator('select').last();
    await expect(picker).toBeEnabled();
    await expect(picker).toHaveValue(`budgetItemId:${programId}`);
  });
});
