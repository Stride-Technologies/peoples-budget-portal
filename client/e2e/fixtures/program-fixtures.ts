import { Page } from '@playwright/test';

/**
 * Creates a program with implementation period
 */
export async function createProgramWithPeriod(
  page: Page,
  programData: {
    name: string;
    startMonth?: number;
    startYear?: number;
    endMonth?: number;
    endYear?: number;
    description?: string;
  }
): Promise<string> {
  // Navigate to programs page and click create
  await page.goto('/budget');
  await page.click('button:has-text("New Program")');

  // Fill in program details
  await page.fill('input[placeholder*="Program name"]', programData.name);
  if (programData.description) {
    await page.fill('textarea[placeholder*="Description"]', programData.description);
  }

  // Set implementation period if provided
  if (programData.startMonth !== undefined) {
    await page.selectOption('select[name*="implementationStartMonth"]', programData.startMonth.toString());
  }
  if (programData.startYear !== undefined) {
    await page.selectOption('select[name*="implementationStartYear"]', programData.startYear.toString());
  }
  if (programData.endMonth !== undefined) {
    await page.selectOption('select[name*="implementationEndMonth"]', programData.endMonth.toString());
  }
  if (programData.endYear !== undefined) {
    await page.selectOption('select[name*="implementationEndYear"]', programData.endYear.toString());
  }

  // Submit form
  await page.click('button:has-text("Create")');

  // Wait for navigation and extract program ID from URL or data
  await page.waitForURL(/\/aip\/\d+/);
  const url = page.url();
  const programId = url.split('/').pop();
  
  return programId || '';
}

/**
 * Creates a project with implementation period
 */
export async function createProjectWithPeriod(
  page: Page,
  projectData: {
    name: string;
    output: string;
    costMode: 'DIRECT_COSTS' | 'ACTIVITY_CHILDREN';
    startMonth?: number;
    startYear?: number;
    endMonth?: number;
    endYear?: number;
  }
): Promise<string> {
  // Click "Add Project" button
  await page.click('button:has-text("Add Project")');

  // Fill in project details
  await page.fill('input[placeholder*="Project name"]', projectData.name);
  await page.fill('textarea[placeholder*="Output"]', projectData.output);

  // Select cost mode
  if (projectData.costMode === 'ACTIVITY_CHILDREN') {
    await page.click('label:has-text("Activity-Derived Costs")');
  } else {
    await page.click('label:has-text("Direct Costs")');
  }

  // Set implementation period if provided
  if (projectData.startMonth !== undefined) {
    await page.selectOption('select[name*="implementationStartMonth"]', projectData.startMonth.toString());
  }
  if (projectData.startYear !== undefined) {
    await page.selectOption('select[name*="implementationStartYear"]', projectData.startYear.toString());
  }
  if (projectData.endMonth !== undefined) {
    await page.selectOption('select[name*="implementationEndMonth"]', projectData.endMonth.toString());
  }
  if (projectData.endYear !== undefined) {
    await page.selectOption('select[name*="implementationEndYear"]', projectData.endYear.toString());
  }

  // Submit form
  await page.click('button:has-text("Create")');

  // Wait for success and extract project ID if visible
  await page.waitForTimeout(1000); // Wait for form to process
  
  return '';
}

/**
 * Adds a line item to a project
 */
export async function addLineItemToProject(
  page: Page,
  expenseClass: 'PS' | 'MOOE' | 'CO',
  quantity: number,
  unit: string,
  unitCost: number
): Promise<void> {
  // Click "Add Line Item" button
  await page.click('button:has-text("Add Line Item")');

  // Select expense class
  await page.selectOption('select[name*="expenseClass"]', expenseClass);

  // Fill in quantity
  await page.fill('input[placeholder*="Quantity"]', quantity.toString());

  // Fill in unit
  await page.fill('input[placeholder*="Unit"]', unit);

  // Fill in unit cost
  await page.fill('input[placeholder*="Unit Cost"]', unitCost.toString());

  // Click add button
  await page.click('button:has-text("Add")');
}

/**
 * Deletes a project with confirmation
 */
export async function deleteProjectAndConfirm(page: Page): Promise<void> {
  // Click delete button (usually in project drawer/menu)
  await page.click('button[aria-label*="Delete"]');

  // Confirm in dialog
  await page.click('button:has-text("Delete")');

  // Wait for deletion to complete
  await page.waitForTimeout(1000);
}

/**
 * Navigates to edit project page
 */
export async function navigateToEditProject(page: Page, projectName: string): Promise<void> {
  // Find project in list and click edit
  const projectRow = page.locator(`text=${projectName}`);
  await projectRow.locator('button:has-text("Edit")').click();

  // Wait for edit form to load
  await page.waitForLoadState('networkidle');
}

/**
 * Gets all text content from totals section
 */
export async function getProjectTotals(page: Page): Promise<{
  ps?: string;
  mooe?: string;
  co?: string;
  grand?: string;
}> {
  const psAmount = await page.locator('text=/PS.*\\d+/').first().textContent();
  const mooeAmount = await page.locator('text=/MOOE.*\\d+/').first().textContent();
  const coAmount = await page.locator('text=/CO.*\\d+/').first().textContent();
  const grandAmount = await page.locator('text=/Grand Total.*\\d+/').first().textContent();

  return {
    ps: psAmount?.match(/[\d,]+/)?.[0],
    mooe: mooeAmount?.match(/[\d,]+/)?.[0],
    co: coAmount?.match(/[\d,]+/)?.[0],
    grand: grandAmount?.match(/[\d,]+/)?.[0],
  };
}
