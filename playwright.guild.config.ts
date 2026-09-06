import { defineConfig, devices } from '@playwright/test';
// Separate server and artifacts; never reuse or stop another worker's server.
const port = Number(process.env.GUILD_E2E_PORT || 4297);
export default defineConfig({
  testDir: './tests/e2e', testMatch: /(?:today-guild|guild-publication|guild-extended)\.spec\.ts/,
  outputDir: `/tmp/palworld-guild-acceptance-${port}`, fullyParallel: true,
  forbidOnly: !!process.env.CI, retries: 0, reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: { command: `npm run dev -- --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false },
});
