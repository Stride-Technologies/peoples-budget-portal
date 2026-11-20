/**
 * A year with both a public AIP and an enacted budget is in both sections, and
 * each section links to the other (specs/012 D14, `OtherDocument`). Skips when
 * the database has no such year.
 */
import { test, expect } from '@playwright/test';
import { findYear } from './helpers';

test('the AIP and the enacted budget of one year link to each other', async ({
  page,
  request,
}) => {
  const year = await findYear(
    request,
    (c) => c.sections.includes('aip') && c.sections.includes('annual'),
  );
  test.skip(!year, 'No year in both sections');
  const fy = year!.fiscalYear;

  await page.goto(`/aip/${fy}`);
  await expect(
    page.getByText(`The city has enacted its ${fy} budget.`),
  ).toBeVisible();
  await page.getByRole('link', { name: `Read the enacted ${fy} budget` }).click();
  await expect(page).toHaveURL(new RegExp(`/annual/${fy}/`));

  await expect(
    page.getByText(`This is the budget the city enacted for ${fy}.`),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Read the plan it started from' }).click();
  await expect(page).toHaveURL(new RegExp(`/aip/${fy}/`));
});
