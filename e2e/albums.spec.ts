import { test, expect } from "./fixtures";

/**
 * Album Management tests.
 *
 * Tests the album creation, listing, and image-album association workflow.
 * Based on REQUIREMENTS section 4 (UI/UX - Albums in sidebar).
 */
test.describe("Album Management", () => {
  test.describe("Albums in Store", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
      await app.mockAlbums([
        { id: 1, name: "Summer 2025" },
        { id: 2, name: "Wedding Photos" },
        { id: 3, name: "Trip to Japan" },
      ]);
    });

    test("mocked albums are stored in the catalog store", async ({ page }) => {
      const albumCount = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().albums.length;
      });
      expect(albumCount).toBe(3);
    });

    test("mocked albums have correct names", async ({ page }) => {
      const albums = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().albums;
      });
      expect(albums[0].name).toBe("Summer 2025");
      expect(albums[1].name).toBe("Wedding Photos");
    });

    test("albums have required fields", async ({ page }) => {
      const albums = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().albums;
      });
      for (const album of albums) {
        expect(album).toHaveProperty("id");
        expect(album).toHaveProperty("name");
        expect(album).toHaveProperty("created_at");
      }
    });
  });

  test.describe("Album UI", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
    });

    test("selecting an image shows details panel for album operations", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Details panel should show image info
      await expect(page.getByText("image_1.jpg")).toBeVisible();
    });
  });
});
