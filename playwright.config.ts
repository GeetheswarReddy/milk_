import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir: './tests/browser', timeout: 45000, workers: 1,
 use: { baseURL: 'http://127.0.0.1:4174', viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true, launchOptions: { executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } },
 webServer: { command: 'npm run build:browser && npx vite preview --outDir dist-browser --host 127.0.0.1 --port 4174', port: 4174, reuseExistingServer: false, timeout: 60000 },
});
