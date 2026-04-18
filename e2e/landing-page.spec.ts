import { test, expect } from '@playwright/test';

test.describe('Landing Page', () => {
  test('loads the homepage with key elements', async ({ page }) => {
    await page.goto('/');

    // Should have a main heading
    await expect(page.locator('h1').first()).toBeVisible();

    // Should have navigation or call-to-action
    await expect(page.getByRole('link', { name: /sign|login|get started/i }).first()).toBeVisible();
  });

  test('has proper page title', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/compliance|building/i);
  });

  test('pricing page loads', async ({ page }) => {
    await page.goto('/pricing');
    await expect(page.locator('body')).toContainText(/free|pro|portfolio/i);
  });
});

test.describe('Auth Flow', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login');
    // Should have email input and sign in button
    await expect(page.getByRole('textbox').first()).toBeVisible();
  });

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('settings redirect to login when not authenticated', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Calculator (Public)', () => {
  test('calculator page loads', async ({ page }) => {
    await page.goto('/calculator');
    await expect(page.locator('body')).toContainText(/calculator|emissions|compliance/i);
  });
});
