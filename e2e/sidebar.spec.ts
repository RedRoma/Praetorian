import { test, expect } from "./fixtures";

/**
 * Sidebar tests.
 *
 * The sidebar only renders when useCatalogStore.path exists AND leftPanelVisible is true.
 * Without a catalog loaded, the sidebar is not in the DOM at all.
 *
 * To test the "catalog loaded" state, expose the Zustand store:
 *   In src/hooks/useCatalog.ts, add: `;(window as any).__CATALOG_STORE__ = useCatalogStore;`
 * after the `create()` call.
 */
test.describe("Sidebar", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
  });

  test("sidebar is not visible when no catalog loaded", async ({ page }) => {
    // The sidebar has a distinctive width class: w-56 bg-[#1e1e1e]
    const sidebar = page.locator('[class*="w-56"][class*="bg-"]');
    await expect(sidebar).not.toBeVisible();
  });

  test("sidebar search input is not present on landing page", async ({ page }) => {
    await expect(page.getByPlaceholder("Search...")).not.toBeVisible();
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app, page }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("sidebar appears with search input", async ({ page }) => {
      const sidebar = page.locator('[class*="w-56"]');
      await expect(sidebar).toBeVisible();
      await expect(page.getByPlaceholder("Search...")).toBeVisible();
    });

    test("shows All Photos, Favorites, and Rated items", async ({ page }) => {
      await expect(page.getByText("All Photos")).toBeVisible();
      await expect(page.getByText("Favorites")).toBeVisible();
      await expect(page.getByText("Rated")).toBeVisible();
    });

    test("shows Folders section header", async ({ page }) => {
      await expect(page.getByText("Folders")).toBeVisible();
    });

    test("hides sidebar when toggle button clicked", async ({ page }) => {
      await page.getByRole("button", { name: /Hide.*Sidebar/i }).click();
      const sidebar = page.locator('[class*="w-56"]');
      await expect(sidebar).not.toBeVisible();
    });

    test("shows folder items in Folders section", async ({ page, app }) => {
      // mockImages includes folders in the store data
      await app.mockImages(3);
      await expect(page.getByText("DCIM")).toBeVisible();
      await expect(page.getByText("Photos", { exact: true })).toBeVisible();
    });
  });
});
