import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/design-qa.capture.ts',
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4175',
    channel: 'chrome',
    viewport: { width: 1588, height: 1066 },
    deviceScaleFactor: 1,
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4175',
    url: 'http://127.0.0.1:4175',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
