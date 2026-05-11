import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:25111',
    headless: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'bun server.ts --node-id=e2e-test --api-port=25111',
    url: 'http://localhost:25111/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 30000,
  },
});
