import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.PORT || 4173);

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: { command: 'node tests/server.mjs', url: `http://127.0.0.1:${port}`, reuseExistingServer: true },
  projects: [
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
    // Headless Chromium otherwise draws WebGL in software (SwiftShader), ~75x slower than the GPU a real Chrome uses.
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } } },
    // Firefox is left out: Playwright's Firefox build fails to launch on this macOS version ("Could not find profile folder").
    { name: 'iphone', use: { ...devices['iPhone 13'] } },
  ],
});
