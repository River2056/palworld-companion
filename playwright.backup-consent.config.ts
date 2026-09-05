import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',testMatch:'backup-consent.spec.ts',
 outputDir:'/tmp/palworld-backup-consent-results',reporter:'list',
 use:{baseURL:'http://127.0.0.1:4297',trace:'retain-on-failure'},
 projects:[{name:'backup-chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'npm run dev -- --port 4297 --strictPort',url:'http://127.0.0.1:4297',reuseExistingServer:false},
});
