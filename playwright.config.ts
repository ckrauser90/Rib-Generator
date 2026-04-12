import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
    video: process.env.CI ? "retain-on-failure" : "off",
  },
  webServer: {
    command:
      'cmd /c "npm run build && npm run start -- --hostname 127.0.0.1 --port 3005"',
    url: "http://127.0.0.1:3005",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "msedge",
      use: { ...devices["Desktop Edge"], channel: "msedge" },
    },
  ],
});
