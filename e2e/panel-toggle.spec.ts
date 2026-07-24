import { test, expect } from "./fixtures";

/**
 * Panel Toggle tests.
 *
 * Tests the sidebar and details panel show/hide toggle buttons.
 * Based on REQUIREMENTS section 4 (UI/UX Guidelines - Layout).
 */
test.describe("Panel Toggles", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("Hide Sidebar button is not visible on landing page", async ({ page }) => {
      const hideSidebar = page.getByRole("button", { name: /Hide.*Sidebar/i });
      await expect(hideSidebar).not.toBeVisible();
    });

    test("Hide Details button is not visible on landing page", async ({ page }) => {
      const hideDetails = page.getByRole("button", { name: /Hide.*Details/i });
      await expect(hideDetails).not.toBeVisible();
    });
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("both toggle buttons are visible", async ({ page }) => {
      const hideSidebar = page.getByRole("button", { name: /Hide.*Sidebar/i });
      const hideDetails = page.getByRole("button", { name: /Hide.*Details/i });
      await expect(hideSidebar).toBeVisible();
      await expect(hideDetails).toBeVisible();
    });

    test("clicking Hide Sidebar hides the sidebar panel", async ({ page }) => {
      // First verify sidebar is visible
      const sidebar = page.locator('[class*="w-56"]');
      await expect(sidebar).toBeVisible();

      await page.getByRole("button", { name: /Hide.*Sidebar/i }).click();

      // Sidebar should be gone from DOM (conditionaled on leftPanelVisible)
      await expect(sidebar).not.toBeVisible();
    });

    test("clicking Hide Sidebar changes button to Show Sidebar", async ({ page }) => {
      await page.getByRole("button", { name: /Hide.*Sidebar/i }).click();
      const showSidebar = page.getByRole("button", { name: /Show.*Sidebar/i });
      await expect(showSidebar).toBeVisible();
    });

    test("clicking Show Sidebar restores the sidebar panel", async ({ page }) => {
      // Hide first
      await page.getByRole("button", { name: /Hide.*Sidebar/i }).click();

      // Then show back
      await page.getByRole("button", { name: /Show.*Sidebar/i }).click();

      const sidebar = page.locator('[class*="w-56"]');
      await expect(sidebar).toBeVisible();
    });

    test("clicking Hide Details hides the details panel", async ({ page }) => {
      // Verify details panel is visible
      const detailsPanel = page.locator('[class*="w-72"][class*="border-l"]');
      await expect(detailsPanel).toBeVisible();

      await page.getByRole("button", { name: /Hide.*Details/i }).click();

      // Details panel should be gone from DOM
      await expect(detailsPanel).not.toBeVisible();
    });

    test("clicking Hide Details changes button to Show Details", async ({ page }) => {
      await page.getByRole("button", { name: /Hide.*Details/i }).click();
      const showDetails = page.getByRole("button", { name: /Show.*Details/i });
      await expect(showDetails).toBeVisible();
    });

    test("clicking Show Details restores the details panel", async ({ page }) => {
      // Hide first
      await page.getByRole("button", { name: /Hide.*Details/i }).click();

      // Then show back
      await page.getByRole("button", { name: /Show.*Details/i }).click();

      const detailsPanel = page.locator('[class*="w-72"][class*="border-l"]');
      await expect(detailsPanel).toBeVisible();
    });

    test("sidebar and details toggle independently", async ({ page }) => {
      const sidebar = page.locator('[class*="w-56"]');
      const detailsPanel = page.locator('[class*="w-72"][class*="border-l"]');

      // Both visible initially
      await expect(sidebar).toBeVisible();
      await expect(detailsPanel).toBeVisible();

      // Hide sidebar only
      await page.getByRole("button", { name: /Hide.*Sidebar/i }).click();
      await expect(sidebar).not.toBeVisible();
      await expect(detailsPanel).toBeVisible();

      // Hide details only
      await page.getByRole("button", { name: /Hide.*Details/i }).click();
      await expect(sidebar).not.toBeVisible();
      await expect(detailsPanel).not.toBeVisible();

      // Show sidebar back
      await page.getByRole("button", { name: /Show.*Sidebar/i }).click();
      await expect(sidebar).toBeVisible();
      await expect(detailsPanel).not.toBeVisible();
    });

    test("toolbar shows divider between toggle and Import buttons", async ({ page }) => {
      // There's a vertical divider between panel toggles and Import
      const divider = page.locator('[class*="w-px"][class*="h-5"]');
      await expect(divider).toBeVisible();
    });
  });
});
