import { defineConfig } from "@playwright/test";

/**
 * Week 6 vertical slice E2E. One worker because the flow shares the seeded
 * database; the mobile viewport matches the wireframes (360 x 740).
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 360, height: 740 },
    isMobile: true,
    hasTouch: true,
    // CI uses the Playwright-bundled Chromium. Local runs can opt into an
    // installed browser (for example PLAYWRIGHT_CHANNEL=msedge) when the
    // browser download is unavailable.
    ...(process.env.PLAYWRIGHT_CHANNEL
      ? {
          channel: process.env.PLAYWRIGHT_CHANNEL as
            | "chromium"
            | "chrome"
            | "msedge",
        }
      : {}),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "npm run dev:api",
      url: "http://localhost:4000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: "npm run dev:web",
      url: "http://localhost:3000",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});
