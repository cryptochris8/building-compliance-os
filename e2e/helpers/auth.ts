import { expect, type Page } from '@playwright/test';

/**
 * Required env vars: TEST_USER_EMAIL, TEST_USER_PASSWORD.
 * Callers should guard with `test.skip(!hasTestCredentials(), ...)`.
 */
export function hasTestCredentials(): boolean {
  return Boolean(process.env.TEST_USER_EMAIL && process.env.TEST_USER_PASSWORD);
}

export async function loginViaUI(page: Page): Promise<void> {
  const email = process.env.TEST_USER_EMAIL;
  const password = process.env.TEST_USER_PASSWORD;
  if (!email || !password) {
    throw new Error('TEST_USER_EMAIL and TEST_USER_PASSWORD must be set');
  }

  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/(dashboard|onboarding)/, { timeout: 15_000 });
}
