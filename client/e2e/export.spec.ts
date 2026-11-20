import { expect, test, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@example.gov.ph';
const ADMIN_PASSWORD = 'Password123!';

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.getByRole('textbox', { name: /email/i }).fill(ADMIN_EMAIL);
  await page.getByRole('textbox', { name: /password/i }).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}

test('super admin can export a cluster workbook from the registry', async ({
  page,
}) => {
  await login(page);
  await page.goto(`${BASE}/aip-registry`, { waitUntil: 'domcontentloaded' });

  const exportButton = page.getByRole('button', {
    name: /open export menu/i,
  });
  await expect(page.getByRole('heading', { name: /aip registry/i })).toBeVisible();
  await expect(exportButton).toBeEnabled();
  await exportButton.click();

  await page.getByRole('menuitem', { name: /export by cluster/i }).click();
  await expect(
    page.getByRole('dialog', { name: /export by cluster/i }),
  ).toBeVisible();
  await expect(page.getByRole('combobox', { name: /cluster/i })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /export cluster/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/aip-\d{4}-.+-export\.xlsx/);

  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(downloadPath!);

  const sheetNames = workbook.worksheets.map((sheet: ExcelJS.Worksheet) => sheet.name);
  expect(sheetNames[0]).toBe('Export Info');
  expect(sheetNames[1]).toBe('GOALS');
  expect(sheetNames.some((name: string) => name.endsWith(' - Basic AIP Form'))).toBe(
    true,
  );
  expect(
    sheetNames.some((name: string) => name.endsWith(' - Extended AIP Form')),
  ).toBe(true);
});
