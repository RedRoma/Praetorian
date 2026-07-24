import { test, expect } from "./fixtures";

/**
 * AI Features tests.
 *
 * Tests the AI upscale and face index UI elements.
 * Based on REQUIREMENTS section C (Face Recognition) and D (AI Upscaling).
 */
test.describe("AI Features", () => {
  test.describe("Face Index Status", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
    });

    test("images have faces_indexed property", async ({ page }) => {
      const facesIndexed = await page.evaluate(() => {
        const images = (window as any).__CATALOG_STORE__.getState().images;
        return images.map((img: any) => img.faces_indexed);
      });
      // First 3 images have faces_indexed: true, rest false
      expect(facesIndexed[0]).toBe(true);
      expect(facesIndexed[3]).toBe(false);
    });

    test("processing panel shows Faces Indexed status", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // The processing section should show Faces Indexed
      await expect(page.getByText("Faces Indexed")).toBeVisible();
    });
  });

  test.describe("Catalog Stats for AI", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(20);
      await app.mockStats({
        totalImages: 20,
        totalFaces: 45,
        totalPeople: 5,
        unindexedFaces: 10,
      });
    });

    test("stats track face detection progress", async ({ page }) => {
      const stats = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().stats;
      });
      expect(stats.total_faces).toBe(45);
      expect(stats.unindexed_faces).toBe(10);
    });

    test("people count is tracked in stats", async ({ page }) => {
      const peopleCount = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().stats!.total_people;
      });
      expect(peopleCount).toBe(5);
    });
  });

  test.describe("Processing Pipeline Status", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
    });

    test("tiered image pipeline states are tracked per image", async ({ page }) => {
      const images = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().images;
      });

      // Verify tiered pipeline fields exist
      for (const img of images) {
        expect(img).toHaveProperty("has_thumbnail");
        expect(img).toHaveProperty("has_preview");
        expect(img).toHaveProperty("faces_indexed");
      }
    });

    test("first image has all pipeline stages complete", async ({ page }) => {
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.first().click();

      // Image 1 has has_thumbnail: true, has_preview: true, faces_indexed: true
      const doneBadges = page.getByText("Done");
      await expect(doneBadges).toBeVisible();
    });

    test("later images may have pending pipeline stages", async ({ page }) => {
      // Click image at index 5 (has_thumbnail: false, has_preview: false, faces_indexed: false)
      const thumbnails = page.locator('[class*="rounded"][class*="overflow-hidden"]');
      await thumbnails.nth(5).click();

      // Should show Pending badges since all are false for this image
      const pendingBadges = page.getByText("Pending");
      await expect(pendingBadges).toBeVisible();
    });
  });
});
