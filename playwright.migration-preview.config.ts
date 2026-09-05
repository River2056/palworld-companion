import {defineConfig,devices} from '@playwright/test';
const port=Number(process.env.MIGRATION_PREVIEW_PORT??4398);
process.env.CATALOG_RUNTIME_URL=`http://127.0.0.1:${port}`;
export default defineConfig({testDir:'./tests/e2e',testMatch:'catalog-runtime.spec.ts',outputDir:'/tmp/palworld-migration-preview-results',reporter:'list',workers:2,use:{trace:'retain-on-failure'},projects:[{name:'preview-desktop',use:{...devices['Desktop Chrome']}},{name:'preview-mobile',use:{...devices['Pixel 7']}}],webServer:{command:`npm run dev -- --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,reuseExistingServer:false}});
