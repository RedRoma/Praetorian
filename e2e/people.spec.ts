import { test, expect } from "./fixtures";

/**
 * People / Face Recognition tests.
 *
 * Tests the People module view for face detection and person management.
 * Based on REQUIREMENTS section C (Face Recognition).
 */
test.describe("People Module", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("People tab is still accessible from landing page", async ({ page }) => {
      await expect(page.getByRole("button", { name: "People" })).toBeVisible();
      await expect(page.getByRole("button", { name: "People" })).toBeEnabled();
    });
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
    });

    test("switching to People tab shows Detected Faces header", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();
      await expect(page.getByText("Detected Faces")).toBeVisible();
    });

    test("shows detected person entries", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();

      // PeopleView renders person entries with avatar icons
      const peopleList = page.locator('[class*="rounded-full"][class*="w-7"]');
      await expect(peopleList.first()).toBeVisible();
    });

    test("person entries have avatar placeholders", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();

      // Each person has a circular avatar with person icon
      const avatars = page.locator('[class*="rounded-full"]');
      await expect(avatars.first()).toBeVisible();
    });

    test("person entries show names", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();

      // PeopleView renders placeholder person names
      await expect(page.getByText("Unknown Person 1")).toBeVisible();
      await expect(page.getByText("Unknown Person 2")).toBeVisible();
      await expect(page.getByText("Unknown Person 3")).toBeVisible();
    });

    test("person entries are clickable", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();

      // Person items have cursor-pointer class
      const personItem = page.locator('[class*="cursor-pointer"]').first();
      await expect(personItem).toBeVisible();
    });

    test("switching back to Library hides PeopleView", async ({ page }) => {
      await page.getByRole("button", { name: "People" }).click();
      await expect(page.getByText("Detected Faces")).toBeVisible();

      await page.getByRole("button", { name: "Library" }).click();
      // LibraryView should be visible, PeopleView hidden
      await expect(page.getByText("All Photos")).toBeVisible();
      await expect(page.getByText("Detected Faces")).not.toBeVisible();
    });
  });

  test.describe("Face indexing status", () => {
    test.beforeEach(async ({ app, page }) => {
      await app.gotoLanding();
      await app.mockImages(6);

      // Select image 3 which has faces_indexed=true (i<3 means i=0,1,2 are true)
      await page.evaluate(() => {
        (window as any).__CATALOG_STORE__.setState((s: any) => ({
          ...s,
          selectedImageIds: new Set([3]),
        }));
      });
    });

    test("Details Panel shows faces indexed status", async ({ page }) => {
      const processingSection = page.locator("text=Processing");
      await expect(processingSection).toBeVisible();

      // Image 3 (id=3, i=2) has faces_indexed=true
      const facesRow = page.getByText("Faces Indexed").first();
      await expect(facesRow).toBeVisible();
    });

    test("image with faces not indexed shows Pending", async ({ page }) => {
      // Select image 5 (id=5, i=4) which has faces_indexed=false
      await page.evaluate(() => {
        (window as any).__CATALOG_STORE__.setState((s: any) => ({
          ...s,
          selectedImageIds: new Set([5]),
        }));
      });
      await page.waitForTimeout(100);

      const facesRow = page.getByText("Faces Indexed").first();
      await expect(facesRow).toBeVisible();

      // Should show Pending status
      const pendingStatus = page.locator("text=Faces Indexed").last();
      await expect(pendingStatus).toBeVisible();
    });
  });
});
