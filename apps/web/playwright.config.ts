import { defineConfig, devices } from "@playwright/test";

const webBaseUrl = process.env.E2E_WEB_URL ?? "http://localhost:5174";
const apiBaseUrl = process.env.E2E_API_URL ?? "http://localhost:3333";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: {
    timeout: 15_000
  },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: webBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "npm run dev --workspace=@app-treino/api",
      url: `${apiBaseUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "npm run dev --workspace=@app-treino/web",
      url: webBaseUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
