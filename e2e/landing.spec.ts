import { test, expect } from "./fixtures";

/**
 * Landing page tests.
 *
 * These verify the home screen shown when no catalog is loaded.
 * All assertions are purely visual — no Tauri native APIs are invoked.
 */
test.describe("Landing Page", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
  });

  test("shows app title", async ({ page }) => {
    const title = page.getByRole("heading", { name: "Praetorian" });
    await expect(title).toBeVisible();
  });

  test("shows subtitle describing the app", async ({ page }) => {
    await expect(page.getByText(/photo library/)).toBeVisible();
  });

  test("displays Open Catalog button", async ({ page }) => {
    const openBtn = page.getByRole("button", { name: "Open Catalog" }).first();
    await expect(openBtn).toBeVisible();
    await expect(openBtn).toBeEnabled();
  });

  test("displays New Catalog button", async ({ page }) => {
    const newBtn = page.getByRole("button", { name: "New Catalog" });
    await expect(newBtn).toBeVisible();
    await expect(newBtn).toBeEnabled();
  });

  test("toolbar module tabs are present", async ({ page }) => {
    // Module tabs render regardless of catalog state
    await expect(page.getByRole("button", { name: "Library" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Develop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "People" })).toBeVisible();
  });

  test("sidebar is NOT visible on landing page", async ({ page }) => {
    // Sidebar only renders when a catalog path exists in the store
    const sidebar = page.locator('[class*="w-56"]');
    await expect(sidebar).not.toBeVisible();
  });
});
