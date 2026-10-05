// Playwright-Konfiguration für das Segmentierungs-Labor (tests/lab).
//
// Zweck: Startet die App mit RIB_LAB=1 im Dev-Modus, damit die Laborseite
// existiert, und gibt den langsamen Modell-Läufen genug Zeit. Getrennt von der
// normalen E2E-Konfiguration, weil das Labor große lokale Modelle braucht
// (npm run lab:models) und nicht in jeden CI-Lauf gehört.

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/lab",
  timeout: 60 * 60 * 1000,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3006",
    ...devices["Desktop Chrome"],
    launchOptions: {
      // WebGL ohne GPU (für die synthetischen Renderings in headless Chromium).
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
    },
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3006",
    url: "http://127.0.0.1:3006/lab/segmentation",
    env: { RIB_LAB: "1" },
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
