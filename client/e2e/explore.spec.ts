/**
 * Data Explorer (specs/018 P1). Public, anonymous. Needs the API and client
 * running with EXPLORER_ENABLED=1 / NEXT_PUBLIC_EXPLORER_ENABLED=1 and at least
 * one year with open data on.
 */
import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';

/** WCAG 2.2 AA (DESIGN.md: AA is what is measured today). */
const axe = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();

test.describe('explore', () => {
  test('lands on a finished chart with its table and cards', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.locator('tfoot')).toContainText('Total');
    await expect(page.getByRole('link', { name: /2027/ }).first()).toBeVisible();
  });

  test('a card sets the URL and back restores the previous view', async ({ page }) => {
    await page.goto('/explore');
    const before = page.url();
    await page.getByRole('link', { name: /offices have the biggest/i }).click();
    await expect(page).toHaveURL(/by=office/);
    await page.goBack();
    await expect(page).toHaveURL(before);
  });

  test('changing the breakdown re-resolves without a model', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=sector&chart=bar');
    await page.getByLabel('by', { exact: true }).selectOption('fund');
    await expect(page).toHaveURL(/by=fund/);
    await expect(page.getByRole('columnheader', { name: 'Fund' })).toBeVisible();
  });

  test('themes are never totalled as a share of the whole', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=theme&chart=bar');
    await expect(page.getByRole('complementary').getByText(/more than one theme/)).toBeVisible();
  });

  test('a broken link falls back to the starting chart with a notice', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=theme&chart=stackedBar');
    await expect(page.getByRole('status').filter({ hasText: /could not be shown/ })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('exports: CSV downloads, XLSX is public', async ({ page, request }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=sector&chart=bar');
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const xlsx = await request.get('/api/explore/export?v=1&s=aip:2027:money&by=sector&chart=bar', { maxRedirects: 0 });
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
  });

  test('the chart is SVG with a title and the table is always present', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/explore?v=1&s=aip:2027:money&by=finishLine&chart=bar');
    await expect(page.locator('svg#explore-chart title')).toHaveCount(1);
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('a shared view previews its own chart', async ({ page, request }) => {
    const q = 'v=1&s=aip:2027:money&by=office&chart=bar';
    await page.goto(`/explore?${q}`);
    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toContain('/api/explore/og?');
    const img = await request.get(new URL(og!).pathname + new URL(og!).search);
    expect(img.status()).toBe(200);
    expect(img.headers()['content-type']).toContain('image/png');
  });

  test('the filters button counts what it would show before applying', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=sector&chart=bar');
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('button', { name: /^Show .*items/ })).toBeVisible();
  });

  test('explain opens and its figures link to table rows', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=sector&chart=bar');
    await page.getByText('Explain this chart').click();
    const fig = page.locator('details a[href^="#row-"]').first();
    await expect(fig).toBeVisible();
    await fig.click();
    await expect(page).toHaveURL(/#row-/);
  });

  test('accessibility: no WCAG 2.2 AA violations on the page, Explain and the filters sheet', async ({ page }) => {
    await page.goto('/explore?v=1&s=aip:2027:money&by=sector&chart=bar');
    expect((await axe(page)).violations).toEqual([]);
    await page.getByText('Explain this chart').click();
    expect((await axe(page)).violations).toEqual([]);
    await page.getByRole('button', { name: /^Filters/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    // Measure the sheet once it has faded in, not a frame of the transition.
    await page.waitForFunction(() => {
      const d = document.querySelector('[role="dialog"]');
      return !!d && getComputedStyle(d).opacity === '1' && !d.hasAttribute('data-starting-style');
    });
    expect((await axe(page)).violations).toEqual([]);
  });

  test('the Ask box is a labelled field', async ({ page }) => {
    await page.goto('/explore');
    await expect(page.getByRole('textbox', { name: 'Ask a question about the budget' })).toBeVisible();
  });
});
