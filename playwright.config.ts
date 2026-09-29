import { defineConfig, devices } from '@playwright/test';
import 'dotenv/config';

/**
 * Two projects share one config:
 *  - `api`  : pure REST tests, no browser is launched (fast, run first in CI).
 *  - `e2e`  : browser journeys in Chromium.
 *
 * URLs come from env so the same suite runs against the hosted demo,
 * a self-hosted RealWorld stack, or a GSP-style staging environment.
 */
const BASE_URL = process.env.BASE_URL ?? 'https://conduit.bondaracademy.com';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true, // safe: every test creates its own users/articles
  forbidOnly: isCI, // a stray test.only must fail the build, not silently shrink it
  // Retries only in CI, and every retry is recorded in the report as "flaky".
  // A retry hides nothing: flaky tests are visible and get fixed, not ignored.
  retries: isCI ? 2 : 0,
  workers: isCI ? 4 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI
    ? [['html', { open: 'never' }], ['github'], ['list']]
    : [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'api',
      testDir: './tests/api',
    },
    {
      name: 'e2e',
      testDir: './tests/e2e',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
