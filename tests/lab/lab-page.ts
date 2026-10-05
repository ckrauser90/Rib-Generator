// Gemeinsame Helfer der Labor-Specs: Laborseite öffnen und auf `window.__ribLab` warten.

import { expect, type Page } from "@playwright/test";

export const openLab = async (page: Page) => {
  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[browser] ${message.text()}`);
  });
  await page.goto("/lab/segmentation");
  await expect
    .poll(() => page.evaluate(() => window.__ribLabReady === true), { timeout: 120_000 })
    .toBe(true);
};
