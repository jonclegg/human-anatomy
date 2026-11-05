import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 4174);

export default defineConfig({
  testDir: './tests/body',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/body-server.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    // Headless Chromium otherwise draws WebGL in software (SwiftShader), far slower than the GPU a real Chrome uses.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } } },
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
