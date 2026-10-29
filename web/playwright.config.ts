import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3108",
    reducedMotion: "reduce",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
  ],
  webServer: {
    command: "npm run start -- --hostname 127.0.0.1 --port 3108",
    url: "http://127.0.0.1:3108",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
