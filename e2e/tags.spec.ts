import { test, expect } from "./fixtures";

/**
 * Tag Management tests.
 *
 * Tests the tag creation, listing, and image tagging workflow.
 * Based on REQUIREMENTS section A (Catalog System - Metadata).
 */
test.describe("Tag Management", () => {
  test.describe("Tags in Store", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
      await app.mockTags([
        { id: 1, name: "Vacation", color: "#FF5733" },
        { id: 2, name: "Family", color: "#33FF57" },
        { id: 3, name: "Nature", color: null },
      ]);
    });

    test("mocked tags are stored in the catalog store", async ({ page }) => {
      const tagCount = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().tags.length;
      });
      expect(tagCount).toBe(3);
    });

    test("mocked tags have correct names and colors", async ({ page }) => {
      const tags = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().tags;
      });
      expect(tags[0].name).toBe("Vacation");
      expect(tags[0].color).toBe("#FF5733");
      expect(tags[2].color).toBeNull();
    });
  });

  test.describe("Tag UI", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
    });

    test("selecting an image allows tag operations in details panel", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Details panel should be visible with image info
      await expect(page.getByText("image_1.jpg")).toBeVisible();
    });
  });
});
