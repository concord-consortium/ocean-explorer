import { test } from "./lib/base-url";
import { expect } from "@playwright/test";

test("renders the simulation controls and canvas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Rotation rate")).toBeVisible();
  await expect(page.getByText("Temp gradient")).toBeVisible();
  await expect(page.getByText("Continents")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("globe view is the default", async ({ page }) => {
  await page.goto("/");
  const viewSelect = page.locator("select").filter({ hasText: "Globe" });
  await expect(viewSelect).toBeVisible();
  await expect(viewSelect).toHaveValue("globe");
  await expect(page.locator("canvas")).toBeVisible();
});

test("view toggle switches between Globe and Map", async ({ page }) => {
  await page.goto("/");
  const viewSelect = page.locator("select").filter({ hasText: "Globe" });

  // Switch to Map
  await viewSelect.selectOption("map");
  await expect(page.locator("canvas")).toBeVisible();

  // Switch back to Globe
  await viewSelect.selectOption("globe");
  await expect(page.locator("canvas")).toBeVisible();
});
