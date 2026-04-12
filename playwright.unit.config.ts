import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/unit",
  fullyParallel: true,
  timeout: 15_000,
  workers: 1,
});
