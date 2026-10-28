import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.DOCAMPO_AUCTION_REVIEW_FILE ??= join(
  tmpdir(),
  'docampo-auction-browser-' + randomUUID() + '.json',
);
export default defineConfig({
  testDir: './apps/web/tests',
  testMatch: '**/auctions.real.spec.ts',
  outputDir: 'test-results/auction-integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'Europe/Lisbon',
  },
  projects: [
    {
      name: 'chromium-auctions-real',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
    },
  ],
  webServer: [
    {
      command:
        'DOCAMPO_AUCTION_REVIEW=1 node --import tsx apps/web/tests/support/real-api-server.mjs',
      url: 'http://127.0.0.1:3011/api/health',
      reuseExistingServer: false,
      timeout: 60000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
    },
    {
      command:
        'VITE_API_URL=http://127.0.0.1:3011/api npm run dev --workspace @docampo/web -- --port 5183',
      url: 'http://127.0.0.1:5183',
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
