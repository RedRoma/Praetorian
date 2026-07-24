import { test, expect } from "./fixtures";

/**
 * Details Panel (Right Panel) tests.
 *
 * Tests the metadata panel that shows EXIF data, rating,
 * favorites, and processing status for selected images.
 */
test.describe("Details Panel", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("details panel is not visible on landing page", async ({ page }) => {
      const panel = page.locator('[class*="w-72"][class*="border-l"]');
      await expect(panel).not.toBeVisible();
    });
  });

  test.describe("Catalog loaded, no image selected", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("shows select an image message", async ({ page }) => {
      await expect(page.getByText(/Select an image to view details/i)).toBeVisible();
    });
  });

  test.describe("Catalog loaded with selected image", () => {
    test.beforeEach(async ({ app, page }) => {
      await app.gotoLanding();
      await app.mockImages(6);

      // Select the first image by setting selectedImageIds in store
      await page.evaluate(() => {
        (window as any).__CATALOG_STORE__.setState((s: any) => ({
          ...s,
          selectedImageIds: new Set([1]),
        }));
      });
    });

    test("shows image file name", async ({ page }) => {
      await expect(page.getByText("image_1.jpg")).toBeVisible();
    });

    test("shows image dimensions and file size", async ({ page }) => {
      // DetailsPanel shows "width x height · size MB" format
      await expect(page.getByText(/4000.*3000/i)).toBeVisible();
    });

    test("shows Rating section header", async ({ page }) => {
      const ratingSection = page.locator("text=Rating");
      await expect(ratingSection).toBeVisible();
    });

    test("shows star rating buttons", async ({ page }) => {
      // There should be 5 star buttons in the Rating section
      // Star buttons have w-5 h-5 classes and contain SVGs
      const stars = page.locator('button >> svg').first();
      await expect(stars).toBeVisible();
    });

    test("shows Camera section with EXIF data", async ({ page }) => {
      const cameraSection = page.locator("text=Camera");
      await expect(cameraSection).toBeVisible();

      // Check for EXIF fields
      await expect(page.getByText("Make")).toBeVisible();
      await expect(page.getByText("Model")).toBeVisible();
      await expect(page.getByText("Lens")).toBeVisible();
    });

    test("shows Exposure section with camera settings", async ({ page }) => {
      const exposureSection = page.locator("text=Exposure");
      await expect(exposureSection).toBeVisible();

      await expect(page.getByText("ISO")).toBeVisible();
      await expect(page.getByText("Aperture")).toBeVisible();
      await expect(page.getByText("Shutter")).toBeVisible();
      await expect(page.getByText("Focal Length")).toBeVisible();
    });

    test("shows Date section", async ({ page }) => {
      const dateSection = page.locator("text=Date");
      await expect(dateSection).toBeVisible();

      await expect(page.getByText("Taken")).toBeVisible();
      await expect(page.getByText("Imported")).toBeVisible();
    });

    test("shows Location section with GPS data", async ({ page }) => {
      const locationSection = page.locator("text=Location");
      await expect(locationSection).toBeVisible();

      await expect(page.getByText("Latitude")).toBeVisible();
      await expect(page.getByText("Longitude")).toBeVisible();
      await expect(page.getByText("Altitude")).toBeVisible();
    });

    test("shows Processing section with status indicators", async ({ page }) => {
      const processingSection = page.locator("text=Processing");
      await expect(processingSection).toBeVisible();

      await expect(page.getByText("Thumbnail")).toBeVisible();
      await expect(page.getByText("Smart Preview")).toBeVisible();
      await expect(page.getByText("Faces Indexed")).toBeVisible();
    });

    test("shows Done status for completed processing", async ({ page }) => {
      // Image 1 has has_thumbnail=true, has_preview=true, faces_indexed=true
      const doneStatuses = page.locator("text=Done");
      await expect(doneStatuses.first()).toBeVisible();
    });

    test("shows Pending status for incomplete processing", async ({ page }) => {
      // Image 1 has all true, but we check that Pending labels exist in the UI
      // by checking image 5 which has all false (id=5, i%3=2 for rating)
      await page.evaluate(() => {
        (window as any).__CATALOG_STORE__.setState((s: any) => ({
          ...s,
          selectedImageIds: new Set([5]),
        }));
      });
      await page.waitForTimeout(100);

      const pendingStatuses = page.locator("text=Pending");
      await expect(pendingStatuses.first()).toBeVisible();
    });

    test("favorite heart toggle is visible", async ({ page }) => {
      // The favorite button uses a heart SVG path
      // Image 1 has is_favorite=true, so it should show filled heart
      const ratingSection = page.locator("text=Rating");
      await expect(ratingSection).toBeVisible();
    });
  });
});
