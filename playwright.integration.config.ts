import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  outputDir: 'test-results/real-integration',
  testDir: './apps/web/tests',
  testMatch: '**/*.real.spec.ts',
  testIgnore: '**/auctions.real.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:5183',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium-real',
      use: { ...devices['Desktop Chrome'], channel: process.env.PLAYWRIGHT_CHANNEL || 'chrome' },
    },
  ],
  webServer: [
    {
      command: 'node --import tsx apps/web/tests/support/real-api-server.mjs',
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
