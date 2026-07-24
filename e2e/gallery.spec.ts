import { test, expect } from "./fixtures";

/**
 * Gallery Grid tests.
 *
 * Tests the central image grid view including empty state,
 * image rendering, and selection behavior.
 */
test.describe("Gallery Grid", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("grid is not visible on landing page", async ({ page }) => {
      // GalleryGrid only renders when path exists in the store
      const grid = page.locator('[class*="overflow-auto"][class*="bg-"]');
      await expect(grid).not.toBeVisible();
    });
  });

  test.describe("Catalog loaded, no images", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("shows empty state message", async ({ page }) => {
      await expect(page.getByText("No images in catalog")).toBeVisible();
    });
  });

  test.describe("Catalog loaded with images", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(10);
    });

    test("grid area is visible", async ({ page }) => {
      // The grid container has overflow-auto and bg-[#181818]
      const grid = page.locator('[class*="overflow-auto"][class*="bg-"]');
      await expect(grid).toBeVisible();
    });

    test("empty state message is hidden", async ({ page }) => {
      await expect(page.getByText("No images in catalog")).not.toBeVisible();
    });

    test("thumbnails render in the grid", async ({ page }) => {
      // Thumbnails are rendered via Thumbnail component
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await expect(thumbnails.first()).toBeVisible();
    });

    test("selecting an image highlights it", async ({ page }) => {
      // Click on the first thumbnail to select it
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // The selected image should have a ring indicator (use aspect-square to target grid, not film strip)
      const selectedRing = page.locator('[class*="aspect-square"][class*="ring-blue-500"]');
      await expect(selectedRing).toBeVisible();
    });

    test("film strip shows thumbnails at bottom", async ({ page }) => {
      // FilmStrip renders below the grid with h-16 height
      const filmStrip = page.locator('[class*="h-16"][class*="bg-"]');
      await expect(filmStrip).toBeVisible();
    });
  });
});
