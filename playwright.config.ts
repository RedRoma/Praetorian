import { defineConfig } from "@playwright/test";

export default defineConfig({
  // Test directory
  testDir: "e2e",

  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,

  // Retry on CI only; local runs get 0 retries for faster feedback.
  retries: process.env.CI ? 1 : 0,

  // Run tests in parallel on CI; serial locally to avoid port conflicts.
  workers: process.env.CI ? undefined : 1,

  // Reporter: use the HTML reporter for local runs, list for CI.
  reporter: process.env.CI ? "list" : "html",

  // Global timeout and action timeout
  globalTimeout: 300_000,
  timeout: 60_000,

  use: {
    // Base URL for the Vite dev server
    baseURL: "http://localhost:1420",

    // Match the Tauri window size (1400x900)
    viewport: { width: 1400, height: 900 },

    // Collect traces on retry for debugging
    trace: "on-first-retry",

    // Screenshot on failure for easier debugging
    screenshot: "only-on-failure",

    // Video capture on failure
    video: "retain-on-failure",
  },

  // Expect configuration
  expect: {
    // Timeout for expect assertions
    timeout: 15_000,
    // Screenshot comparison threshold (0.95 = 95% similarity required)
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.05,
    },
  },

  // chromium browser only — matches the Tauri WebView2/WebKit runtime
  // Dual-mode: run browser tests locally, tauri tests in CI or with `npm run e2e:tauri`
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testDir: "e2e",
      testMatch: "**/*.spec.ts",
    },
    {
      name: "tauri",
      use: {
        browserName: "chromium",
        // Tauri app URL when running with tauri-plugin-playwright
        baseURL: process.env.TAURI_PLAYWRIGHT_URL ?? "http://localhost:1420",
      },
      testDir: "e2e/tauri",
      testMatch: "**/*.spec.ts",
    },
  ],
});
