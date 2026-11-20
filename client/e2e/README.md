# Phase 4 — E2E Test Execution Guide

**Date**: 2026-05-20  
**Status**: Ready for execution  
**Framework**: Playwright + TypeScript

---

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10.32.1+
- Both API and client dev servers running locally

### Environment Setup

```bash
# 1. Ensure dependencies installed (from root)
cd /path/to/peoples-budget-portal
pnpm install

# 2. Start API server (Terminal 1)
pnpm dev:api
# Expected: NestJS running on http://localhost:4000
# Swagger UI available at http://localhost:4000/api/v1/docs

# 3. Start client dev server (Terminal 2)
pnpm dev:client
# Expected: Next.js running on http://localhost:3000

# 4. Seed database with test data (Terminal 3)
pnpm --filter api exec prisma db seed
# Expected: Reference data and admin user created
```

---

### Signing in (administrators confirm an emailed code)

A SUPER_ADMIN confirms an emailed code at every sign-in, so the helpers
(`aip-cycle/api-helpers.ts` `loginTokens`) finish that step themselves: they
read the code from the API's **console mail** and call `/auth/verify-email`.
Run the API with console mail (no `MAIL_PROVIDER`, or `NODE_ENV=test`) writing
to a file, and point the suite at it. MFA is never switched off for tests.

```bash
cd api && NODE_ENV=test node dist/src/main.js > /tmp/portal-api.log 2>&1 &
cd client && E2E_API_LOG=/tmp/portal-api.log API_URL=http://localhost:8000/api/v1 pnpm test:e2e
```

### Specs that write to the database

`budget-cycle/staff-finalize.spec.ts` and `budget-cycle/ppmp-final.spec.ts`
build a throwaway fiscal year (2098 / 2099), use it, and remove it. Like the
aip-cycle suite they run only with `AIP_DESTRUCTIVE_E2E=1`, and while one runs
its year is visible on that database's public site, so don't point them at a
database others are reading. The read-only budget-cycle specs skip those years.

## Running Tests

### Run All Tests (Headless)

```bash
cd client
pnpm test:e2e
```

**Output**: 
- HTML report saved to `client/playwright-report/`
- Test results printed to terminal
- Exit code 0 if all pass, 1 if any fail

### Run Specific Test File

```bash
pnpm test:e2e -- e2e/edit-delete-project-activity.spec.ts
```

### Run Tests with UI (Interactive)

```bash
pnpm test:e2e:ui
```

Opens Playwright Inspector UI where you can:
- See test execution live in browser
- Step through tests manually
- Debug selectors
- Inspect network requests

### Run Tests with Visual Debugging

```bash
pnpm test:e2e -- --debug
```

Starts test with Inspector attached for step-by-step execution.

### Run Single Test

```bash
pnpm test:e2e -- -g "Program with implementation period"
```

### Limit to One Browser (for faster iteration)

```bash
pnpm test:e2e -- --project=chromium
```

Available: `chromium`, `firefox`, `webkit`

---

## Test Filtering & Selection

### Run Tests by Name (glob pattern)

```bash
# Run only tests with "period" in name
pnpm test:e2e -- -g "period"

# Run only tests with "delete" in name  
pnpm test:e2e -- -g "delete"

# Run only "Edit" test suite
pnpm test:e2e -- -g "Edit project form prefills"
```

### Run Only Failed Tests

```bash
# If previous run had failures, retry only those
pnpm test:e2e -- --only-changed
```

---

## Test Configuration

**File**: `client/playwright.config.ts`

Key settings:
- **baseURL**: `http://localhost:3000` — Frontend base
- **timeout**: 30s per test
- **retries**: 0 in dev (2 in CI)
- **workers**: Parallel workers (1 in CI, auto in dev)
- **screenshot**: Captured on failure
- **trace**: Recorded on retry

### Modify for Your Run

```typescript
// Example: Increase timeout for slow network
export default defineConfig({
  timeout: 60_000, // 60 seconds per test
  // ...
});
```

---

## Debugging Failed Tests

### 1. Check Test Output

```bash
pnpm test:e2e -- --reporter=verbose
```

Shows detailed logs of each step.

### 2. View Screenshots/Traces

After a failed test run:

```bash
cd playwright-report
npx playwright show-report
```

Opens HTML report with:
- Screenshots at each step
- Video recording (if enabled)
- Network logs
- Console output

### 3. Interactive Debugging

```bash
pnpm test:e2e -- --debug -g "specific test name"
```

Starts Inspector and pauses at first action. You can:
- Hover over elements to inspect
- Click "Step" to advance
- Type browser console commands
- Modify selectors live

### 4. Check Selector Validity

```bash
pnpm test:e2e -- --project=chromium --headed
```

Runs tests in visible browser (`--headed`). You can see:
- Element highlighting during selection
- Visual feedback of what's being clicked
- Whether selectors are finding elements

---

## Common Issues & Solutions

### Issue: "Timeout waiting for locator to be visible"

**Cause**: Element selector not found or not visible within timeout

**Fix**:
1. Run with `--headed` to see what's on screen
2. Check HTML element IDs/classes changed
3. Increase timeout: `page.click('button', { timeout: 60_000 })`
4. Add wait: `await page.waitForSelector('button')`

### Issue: "Cannot read property 'fill' of undefined"

**Cause**: Element selector returned null

**Fix**:
1. Verify selector in browser DevTools
2. Try more specific selector (class + text)
3. Add `.first()` or `.nth(0)` if multiple elements

### Issue: "Navigation failed"

**Cause**: Page didn't navigate within timeout

**Fix**:
1. Verify dev server running (`curl http://localhost:3000`)
2. Check server logs for errors
3. Increase `waitForURL` timeout
4. Use `waitForNavigation()` explicitly

### Issue: "Test passed locally but fails in CI"

**Common reasons**:
- Different viewport size (CI defaults to 1280x720)
- Different timezone/locale
- Race condition (timing-dependent)

**Fix**:
1. Set explicit viewport in test
2. Add `await page.waitForLoadState('networkidle')`
3. Mock timestamps if time-dependent

---

## Test File Structure

**Location**: `client/e2e/edit-delete-project-activity.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import { createProgramWithPeriod } from './fixtures/program-fixtures';

test.describe('Edit & Delete — Project/Activity Integration Tests', () => {
  // Test 1: Program period
  test('Program with implementation period is created and period displays', async ({ page }) => {
    // Arrange: Setup
    // Act: Do something
    // Assert: Verify result
  });

  // Test 2-8: More tests...
});
```

Each test is isolated:
- Fresh browser context
- No shared state between tests
- Automatic cleanup

---

## Fixtures & Helpers

**Location**: `client/e2e/fixtures/program-fixtures.ts`

Reusable helper functions:

```typescript
// Create program with period
await createProgramWithPeriod(page, {
  name: 'Test Program',
  startMonth: 1,
  startYear: 2025,
  endMonth: 12,
  endYear: 2026,
});

// Get project totals
const totals = await getProjectTotals(page);
console.log(totals.grand); // '17000'
```

**When to add fixtures**:
- Same action repeated 3+ times
- Complex multi-step sequences
- Data setup for tests

---

## Writing New Tests

### Template

```typescript
test('Feature works as expected', async ({ page }) => {
  // 1. Navigate
  await page.goto('/page-url');

  // 2. Interact
  await page.fill('input[name="field"]', 'value');
  await page.click('button:has-text("Submit")');

  // 3. Wait for result
  await page.waitForLoadState('networkidle');

  // 4. Assert
  const element = page.locator('text=Success');
  await expect(element).toBeVisible();
});
```

### Best Practices

1. **Use semantic selectors** (not brittle)
   ```typescript
   // Good
   page.click('button:has-text("Create")')
   
   // Avoid
   page.click('button:nth-child(3)')
   ```

2. **Wait explicitly** (don't rely on implicit waits)
   ```typescript
   await page.waitForLoadState('networkidle');
   await page.waitForSelector('text=Success');
   ```

3. **Keep tests independent** (no shared state)
   ```typescript
   // Good: Each test creates its own data
   test('Test A', async ({ page }) => {
     await createProgramWithPeriod(page, { name: 'A' });
   });
   
   test('Test B', async ({ page }) => {
     await createProgramWithPeriod(page, { name: 'B' });
   });
   ```

4. **Use descriptive names**
   ```typescript
   // Good
   test('Period validation rejects start-after-end', ...)
   
   // Avoid
   test('test 1', ...)
   ```

5. **Comment complex sequences**
   ```typescript
   // Step 1: Setup program with specific period
   // Step 2: Create project outside parent bounds
   // Step 3: Verify error message displayed
   ```

---

## Performance & Optimization

### Test Execution Speed

**Baseline**: All 8 tests should complete in < 60 seconds

To check:

```bash
pnpm test:e2e -- --reporter=list
```

Output shows time per test.

### Optimize Slow Tests

1. **Use `waitForLoadState` wisely**
   ```typescript
   // Waits for idle (slow)
   await page.waitForLoadState('networkidle');
   
   // Waits for DOM ready (fast)
   await page.waitForLoadState('domcontentloaded');
   ```

2. **Reduce timeouts where safe**
   ```typescript
   // Default: 30s (maybe overkill)
   // For specific waits:
   await page.locator('button').first().click({ timeout: 5_000 });
   ```

3. **Run in parallel** (default)
   - Tests run across multiple workers
   - Set workers: `workers: 4` in playwright.config.ts

### Flakiness Prevention

If tests fail randomly:

1. Add explicit waits:
   ```typescript
   await page.waitForLoadState('networkidle');
   ```

2. Use stricter selectors:
   ```typescript
   // Instead of:
   await page.click('button');
   
   // Use:
   await page.click('button:has-text("Create Project")');
   ```

3. Increase timeout for async operations:
   ```typescript
   await page.click('button', { timeout: 10_000 });
   ```

---

## CI/CD Integration

Tests are run automatically on:
- Pull requests
- Commits to `main`
- Manual trigger via GitHub Actions

**Config**: `.github/workflows/` (frontend tests section)

To emulate CI locally:

```bash
CI=true pnpm test:e2e
```

Changes behavior:
- Retries: 2 (instead of 0)
- Workers: 1 (instead of auto)
- Headless: Always true

---

## Troubleshooting Playwright Installation

### Issue: `@playwright/test` not found

```bash
# Reinstall
cd client
pnpm install @playwright/test@latest

# Verify
pnpm exec playwright --version
```

### Issue: Browsers not installed

```bash
# Install browsers
pnpm exec playwright install

# Or install specific browser
pnpm exec playwright install chromium
```

### Issue: Port 3000 already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>

# Or use different port in config
# (then update baseURL in playwright.config.ts)
```

---

## Next Steps

1. **Execute manual QA** (see `phase-4-manual-qa-checklist.md`)
2. **Run E2E tests**: `pnpm test:e2e`
3. **Check test report**: Open `playwright-report/index.html`
4. **Fix bugs** discovered during testing
5. **Sign off** when all checks pass

---

## Reference

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
- [Debugging](https://playwright.dev/docs/debug)
- [API Reference](https://playwright.dev/docs/api/class-page)
