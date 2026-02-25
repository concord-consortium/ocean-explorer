import { test } from "./lib/base-url";
import { expect } from "@playwright/test";

test("renders the simulation controls and canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rotation rate")).toBeVisible();
  await expect(page.getByText("Temp gradient")).toBeVisible();
  await expect(page.getByText("Continents")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});
