import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@example.gov.ph';
const ADMIN_PASSWORD = 'Password123!';

// Helpers: robust click/fill with fallbacks
async function clickWithFallback(page: Page, selectors: string[]) {
  for (const s of selectors) {
    try {
      const el = page.locator(s).first();
      if (await el.count() > 0) {
        await el.click({ timeout: 2000 });
        return true;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  return false;
}

async function fillWithFallback(page: Page, selectors: string[], value: string) {
  for (const s of selectors) {
    try {
      const el = page.locator(s).first();
      if (await el.count() > 0) {
        await el.fill('');
        await el.type(value);
        return true;
      }
    } catch (e) {}
  }
  return false;
}

test('edit program name and verify save toast + redirect', async ({ page }) => {
  // 1. Launch and go to login
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/login-page.png' });

  // 2. Log in using seeded admin creds
  // Try common selectors
  await fillWithFallback(page, [
    'input[name="email"]',
    'input[type="email"]',
    'input[placeholder*="Email"]',
    'input[aria-label*="email"]',
    'input:near(label:text("Email"))'
  ], ADMIN_EMAIL);

  await fillWithFallback(page, [
    'input[name="password"]',
    'input[type="password"]',
    'input[placeholder*="Password"]',
    'input[aria-label*="password"]'
  ], ADMIN_PASSWORD);

  const submitted = await clickWithFallback(page, [
    'button[type="submit"]',
    'button:has-text("Sign in")',
    'button:has-text("Sign In")',
    'button:has-text("Log in")',
    'text=Log in'
  ]);
  if (!submitted) throw new Error('Could not submit login form - no submit button found');

  // Wait for navigation after login
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/after-login.png' });

  // 3. Navigate to /aip-registry
  await page.goto(`${BASE}/aip-registry`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'test-results/aip-registry-list.png' });

  // Open the first program in the list (try several strategies)
  let opened = false;
  // Strategy 1: links with program detail in href
  try {
    const candidate = page.locator('a[href^="/aip-registry/"]').first();
    if (await candidate.count() > 0) {
      await candidate.click();
      opened = true;
    }
  } catch (e) {}

  // Strategy 2: table row link
  if (!opened) {
    try {
      const rowLink = page.locator('table tbody tr').first().locator('a').first();
      if (await rowLink.count() > 0) {
        await rowLink.click();
        opened = true;
      }
    } catch (e) {}
  }

  // Strategy 3: open first "View" or program title link
  if (!opened) {
    try {
      const viewLink = page.locator('a:has-text("View")').first();
      if (await viewLink.count() > 0) {
        await viewLink.click();
        opened = true;
      }
    } catch (e) {}
  }

  // If still not opened, try creating a temporary program by clicking "New program" flows
  if (!opened) {
    // Not implementing creation flow generically - fail with clear message so user can run locally
    throw new Error('Could not find existing program to open. Please ensure at least one program exists for the test.');
  }

  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/opened-program.png' });

  // 4. Click Edit, change program name by appending ' - updated'
  const editClicked = await clickWithFallback(page, [
    'button:has-text("Edit")',
    'a:has-text("Edit")',
    'text=Edit'
  ]);
  if (!editClicked) throw new Error('Could not find Edit button/link');

  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/after-click-edit.png' });

  // Try to find program name input and append
  // Read current value if available
  let currentName = '';
  const nameSelectors = [
    'input[name="name"]',
    'input[id*="name"]',
    'input[placeholder*="Program name"]',
    'input[aria-label*="Program name"]',
    'input:near(label:text("Program name"))'
  ];
  for (const s of nameSelectors) {
    try {
      const el = page.locator(s).first();
      if (await el.count() > 0) {
        currentName = (await el.inputValue()) || '';
        await el.fill(currentName + ' - updated');
        break;
      }
    } catch (e) {}
  }

  // If not filled, try textarea
  if (!currentName) {
    for (const s of ['textarea[name="name"]', 'textarea[id*="name"]']) {
      try {
        const el = page.locator(s).first();
        if (await el.count() > 0) {
          currentName = (await el.inputValue()) || '';
          await el.fill(currentName + ' - updated');
          break;
        }
      } catch (e) {}
    }
  }

  if (!currentName) {
    // As a last resort, try an editable heading / contenteditable
    try {
      const el = page.locator('[contenteditable]');
      if (await el.count() > 0) {
        currentName = (await el.innerText()) || '';
        await el.fill(currentName + ' - updated');
      }
    } catch (e) {}
  }

  await page.screenshot({ path: 'test-results/after-edit-fill.png' });

  // Click Save Changes
  const saved = await clickWithFallback(page, [
    'button:has-text("Save Changes")',
    'button:has-text("Save")',
    'button[type="submit"]:has-text("Save")',
    'text=Save Changes',
    'text=Save'
  ]);
  if (!saved) throw new Error('Could not find Save button');

  // 5. Verify success toast and redirect within 5s
  const toast = page.locator('text=Program saved successfully');
  const redirectPromise = page.waitForURL(/.*\/aip-registry/, { timeout: 5000 }).catch(() => null);
  const toastPromise = toast.waitFor({ state: 'visible', timeout: 5000 }).catch(() => null);

  const [redirectResult, toastResult] = await Promise.all([redirectPromise, toastPromise]);

  await page.screenshot({ path: 'test-results/after-save.png' });

  if (!toastResult) {
    throw new Error('Success toast with text "Program saved successfully" did not appear within 5s');
  }
  if (!redirectResult) {
    throw new Error('Page did not redirect back to /aip-registry within 5s');
  }

  // 6. Return success details via assertions
  expect(toast).toBeVisible();
  expect(page.url()).toMatch(/\/aip-registry$/);
});
