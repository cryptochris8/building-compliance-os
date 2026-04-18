import { test, expect } from '@playwright/test';
import { hasTestCredentials, loginViaUI } from './helpers/auth';

test.describe('Authenticated dashboard flows', () => {
  test.skip(!hasTestCredentials(), 'Set TEST_USER_EMAIL and TEST_USER_PASSWORD to run');

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('reaches the dashboard after login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('body')).not.toContainText(/sign in to building compliance os/i);
  });

  test('opens the buildings list', async ({ page }) => {
    await page.goto('/buildings');
    await expect(page).toHaveURL(/\/buildings/);
    // Buildings list should show either the empty state or a table heading.
    await expect(page.locator('body')).toContainText(/building/i);
  });

  test('opens the new building form', async ({ page }) => {
    await page.goto('/buildings/new');
    await expect(page).toHaveURL(/\/buildings\/new/);
    await expect(page.getByRole('heading').first()).toBeVisible();
  });

  test('opens the settings page', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.locator('body')).toContainText(/billing|plan|members|organization/i);
  });

  test('opens the compliance overview page', async ({ page }) => {
    await page.goto('/compliance');
    await expect(page).toHaveURL(/\/compliance/);
    await expect(page.locator('body')).toContainText(/compliance/i);
  });
});
