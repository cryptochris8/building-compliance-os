import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  // Parallel only in CI, where E2E runs against a production build that can
  // serve concurrent requests. Locally the suite runs against `next dev`
  // (see webServer below), which compiles routes on demand and stalls under
  // parallel load — so local runs are serialized with workers: 1.
  fullyParallel: isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? undefined : 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // CI tests the real production build; locally we reuse a running dev
    // server (or start one) for fast iteration without a build step.
    command: isCI ? 'npm run build && npm run start' : 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    timeout: (isCI ? 300 : 120) * 1000,
  },
});
