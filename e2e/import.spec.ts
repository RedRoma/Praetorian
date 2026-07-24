import { test, expect } from "./fixtures";

/**
 * Import tests.
 *
 * Tests the Import button and import workflow.
 * Based on REQUIREMENTS section A (Catalog System - Import).
 */
test.describe("Import", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("Import button is not visible on landing page toolbar", async ({ page }) => {
      const importBtn = page.locator('[class*="h-10"] >> text="Import"');
      await expect(importBtn).not.toBeVisible();
    });

    test("Open Catalog button is available as entry point", async ({ page }) => {
      // Landing page has its own Open Catalog button
      const openBtn = page.getByRole("button", { name: "Open Catalog" }).first();
      await expect(openBtn).toBeVisible();
      await expect(openBtn).toBeEnabled();
    });

    test("New Catalog button is available as entry point", async ({ page }) => {
      const newBtn = page.getByRole("button", { name: "New Catalog" });
      await expect(newBtn).toBeVisible();
      await expect(newBtn).toBeEnabled();
    });
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("Import button is visible in toolbar", async ({ page }) => {
      const importBtn = page.locator('[class*="h-10"] >> text="Import"');
      await expect(importBtn).toBeVisible();
    });

    test("Import button is enabled", async ({ page }) => {
      const importBtn = page.locator('[class*="h-10"] >> text="Import"');
      await expect(importBtn).toBeEnabled();
    });

    test("Import button has blue background styling", async ({ page }) => {
      // Import button uses bg-blue-600 class (not on h-10 parent, but on the button itself)
      const importBtn = page.locator('button >> text="Import"');
      await expect(importBtn).toBeVisible();
      // Verify it has the blue background class
      const hasBlueBg = await importBtn.getAttribute("class");
      expect(hasBlueBg).toContain("bg-blue-600");
    });

    test("Import button is positioned after panel toggle buttons", async ({ page }) => {
      // Toolbar order: Hide Sidebar, Hide Details, divider, Import
      const hideSidebar = page.getByRole("button", { name: /Hide.*Sidebar/i });
      const importBtn = page.locator('[class*="h-10"] >> text="Import"');

      const sidebarBox = await hideSidebar.boundingBox();
      const importBox = await importBtn.boundingBox();

      // Import should be to the right of Hide Sidebar
      if (sidebarBox && importBox) {
        expect(importBox.x).toBeGreaterThan(sidebarBox.x);
      }
    });
  });
});
