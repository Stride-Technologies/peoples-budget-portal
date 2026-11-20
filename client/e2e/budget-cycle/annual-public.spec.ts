/**
 * A visitor reads an enacted budget year (specs/012 P2/P3): the Annual Budget
 * section serves it from the enacted Ordinance, in the same pages as the AIP.
 * Needs a year in the Annual Budget section (FY2026 on a seeded database).
 */
import { test, expect } from '@playwright/test';
import { API, findYear } from './helpers';

test.describe('Annual Budget section', () => {
  test('overview → browse → program → feedback form', async ({
    page,
    request,
  }) => {
    const year = await findYear(request, (c) => c.sections.includes('annual'));
    test.skip(!year, 'No year in the Annual Budget section');
    const fy = year!.fiscalYear;

    await page.goto(`/annual/${fy}`);
    await expect(page).toHaveURL(new RegExp(`/annual/${fy}/(overview|browse)`));
    await expect(
      page.getByRole('heading', { name: `Annual Budget ${fy}` }),
    ).toBeVisible();

    // The browse count is the API's: every PPA tree is one row.
    const registry = await (
      await request.get(
        `${API}/public/registry?cycleId=${year!.id}&section=annual&limit=1`,
      )
    ).json();
    await page.goto(`/annual/${fy}/browse`);
    await expect(page.getByText(`${registry.total} PPAs`)).toBeVisible();

    await page.locator('table tbody tr').first().click(); // expand an office
    await page.getByRole('button', { name: 'View program' }).first().click();
    await expect(page).toHaveURL(/[?&]program=/);
    const drawer = page.getByRole('dialog');
    await expect(drawer).toBeVisible();

    // reCAPTCHA blocks a scripted submit; the form opening is the check.
    await drawer.getByRole('button', { name: /Leave Feedback/ }).click();
    await expect(page.locator('textarea').last()).toBeVisible();
  });
});
