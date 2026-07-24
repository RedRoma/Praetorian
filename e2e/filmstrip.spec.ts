import { test, expect } from "./fixtures";

/**
 * FilmStrip tests.
 *
 * Tests the bottom film strip navigation bar that shows
 * thumbnails of all loaded images for quick navigation.
 */
test.describe("FilmStrip", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("film strip is not visible on landing page", async ({ page }) => {
      const filmStrip = page.locator('[class*="h-16"][class*="bg-#1a1a1a"]');
      await expect(filmStrip).not.toBeVisible();
    });
  });

  test.describe("Catalog loaded with images", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(10);
    });

    test("film strip is visible at bottom of grid area", async ({ page }) => {
      const filmStrip = page.locator('[class*="h-16"][class*="border-t"]');
      await expect(filmStrip).toBeVisible();
    });

    test("film strip shows thumbnail thumbnails", async ({ page }) => {
      // Film strip items are w-10 h-10 rounded elements
      const thumbs = page.locator('[class*="w-10"][class*="h-10"]');
      await expect(thumbs.first()).toBeVisible();
    });

    test("film strip has horizontal scroll", async ({ page }) => {
      // The container should have overflow-x-auto
      const filmStrip = page.locator('[class*="overflow-x-auto"]');
      await expect(filmStrip).toBeVisible();
    });

    test("clicking film strip thumbnail selects image", async ({ page }) => {
      // Click first film strip thumbnail
      const thumbs = page.locator('[class*="w-10"][class*="h-10"]');
      await thumbs.first().click();

      // Should show selection ring on the clicked film strip thumbnail
      const selected = page.locator('[class*="w-10"][class*="ring-blue-500"]');
      await expect(selected).toBeVisible();
    });

    test("selected thumbnail has ring indicator", async ({ page }) => {
      // Select an image via store
      await page.evaluate(() => {
        (window as any).__CATALOG_STORE__.setState((s: any) => ({
          ...s,
          selectedImageIds: new Set([1]),
        }));
      });
      await page.waitForTimeout(100);

      // Use film strip specific selector to avoid strict mode violation with grid thumbnails
      const ring = page.locator('[class*="w-10"][class*="ring-blue-500"]');
      await expect(ring).toBeVisible();
    });

    test("unselected thumbnails have reduced opacity", async ({ page }) => {
      // Unselected items have opacity-60 class
      const unselected = page.locator('[class*="opacity-60"]');
      await expect(unselected.first()).toBeVisible();
    });
  });
});
