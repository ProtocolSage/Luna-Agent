import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright Configuration for Luna Agent E2E Tests
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["html", { outputFolder: "test-results/playwright-report" }],
    ["json", { outputFile: "test-results/playwright-results.json" }],
    ["junit", { outputFile: "test-results/playwright-junit.xml" }],
  ],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10000,
    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        permissions: ["microphone", "camera", "notifications"],
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        permissions: ["microphone", "camera", "notifications"],
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        permissions: ["microphone", "camera", "notifications"],
      },
    },
    {
      name: "Mobile Chrome",
      use: {
        ...devices["Pixel 5"],
        permissions: ["microphone", "camera", "notifications"],
      },
    },
    {
      name: "Mobile Safari",
      use: {
        ...devices["iPhone 12"],
        permissions: ["microphone", "camera", "notifications"],
      },
    },
  ],

  // Run local development server before starting tests
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      NODE_ENV: "test",
      PORT: "3000",
      VOICE_ENABLED: "true",
      ENABLE_TOOLS: "true",
      DATABASE_URL: "sqlite://./data/test.db",
    },
  },

  // Global setup and teardown
  globalSetup: require.resolve("./tests/setup/global-setup.ts"),
  globalTeardown: require.resolve("./tests/setup/global-teardown.ts"),

  // Test timeout
  timeout: 60 * 1000,

  // Expect timeout for assertions
  expect: {
    timeout: 10000,
  },
});
