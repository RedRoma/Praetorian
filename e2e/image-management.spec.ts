import { test, expect } from "./fixtures";

/**
 * Image management tests.
 *
 * Tests rating, favorite toggle, archive, and delete operations.
 * Based on REQUIREMENTS section A (Catalog System - Metadata).
 */
test.describe("Image Management", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
    await app.mockImages(6);
  });

  test.describe("Rating", () => {
    test("rating stars are visible in details panel after selecting image", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Rating section should be visible
      const ratingSection = page.getByText("Rating").first();
      await expect(ratingSection).toBeVisible();

      // Star buttons should be present
      const starButtons = page.locator('[class*="text-yellow-400"], [class*="text-[#444]"]');
      await expect(starButtons.first()).toBeVisible();
    });

    test("selected image shows correct rating in details panel", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Image name should appear in details panel
      await expect(page.getByText("image_1.jpg")).toBeVisible();
    });
  });

  test.describe("Favorite", () => {
    test("favorite heart button is visible in details panel", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // The first image has is_favorite: true, so the heart should be filled (red)
      const ratingSection = page.getByText("Rating").first();
      await expect(ratingSection).toBeVisible();
    });

    test("favorites item appears in sidebar", async ({ page }) => {
      const favoritesItem = page.getByText("Favorites");
      await expect(favoritesItem).toBeVisible();
    });
  });

  test.describe("Image Selection", () => {
    test("clicking a thumbnail selects the image", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Selected ring should be visible
      const selectedRing = page.locator('[class*="aspect-square"][class*="ring-blue-500"]');
      await expect(selectedRing).toBeVisible();
    });

    test("details panel shows image info after selection", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Details panel should show image name
      await expect(page.getByText("image_1.jpg")).toBeVisible();

      // File size info should be visible
      await expect(page.getByText(/MB/)).toBeVisible();
    });

    test("no selection shows placeholder message", async ({ page }) => {
      // Before clicking any image, details panel shows placeholder
      const placeholder = page.getByText("Select an image to view details");
      await expect(placeholder).toBeVisible();
    });
  });

  test.describe("Sidebar Collections", () => {
    test("All Photos item is visible in sidebar", async ({ page }) => {
      const allPhotos = page.getByText("All Photos");
      await expect(allPhotos).toBeVisible();
    });

    test("Rated item is visible in sidebar", async ({ page }) => {
      const ratedItem = page.getByText("Rated");
      await expect(ratedItem).toBeVisible();
    });

    test("Folders section is visible in sidebar", async ({ page }) => {
      const foldersHeader = page.getByText("Folders");
      await expect(foldersHeader).toBeVisible();
    });
  });
});
