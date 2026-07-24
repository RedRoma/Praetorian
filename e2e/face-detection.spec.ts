import { test, expect } from "./fixtures";

/**
 * Face Detection & People tests.
 *
 * Tests the face detection UI, people management, and People view.
 * Based on REQUIREMENTS section C (Face Recognition).
 */
test.describe("Face Detection", () => {
  test.describe("People View", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("People tab is available in toolbar", async ({ page }) => {
      const peopleTab = page.getByRole("button", { name: "People" });
      await expect(peopleTab).toBeVisible();
    });

    test("switching to People tab shows detected faces section", async ({ page }) => {
      const peopleTab = page.getByRole("button", { name: "People" });
      await peopleTab.click();

      const detectedFacesHeader = page.getByText("Detected Faces");
      await expect(detectedFacesHeader).toBeVisible();
    });

    test("people view shows placeholder persons", async ({ page }) => {
      const peopleTab = page.getByRole("button", { name: "People" });
      await peopleTab.click();

      // The PeopleView component has hardcoded "Unknown Person N" entries
      await expect(page.getByText("Unknown Person 1")).toBeVisible();
    });
  });

  test.describe("People Management", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(6);
      await app.mockPeople([
        { id: 1, name: "Sarah", faceCount: 12 },
        { id: 2, name: "John", faceCount: 8 },
      ]);
    });

    test("mocked people are stored in the catalog store", async ({ page }) => {
      const peopleCount = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().people.length;
      });
      expect(peopleCount).toBe(2);
    });

    test("mocked people have correct names", async ({ page }) => {
      const peopleNames = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().people.map((p: any) => p.name);
      });
      expect(peopleNames).toContain("Sarah");
      expect(peopleNames).toContain("John");
    });
  });

  test.describe("Catalog Stats", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(10);
      await app.mockStats({
        totalImages: 10,
        totalFaces: 25,
        totalPeople: 3,
        unindexedFaces: 5,
      });
    });

    test("stats reflect face detection data", async ({ page }) => {
      const stats = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().stats;
      });
      expect(stats.total_faces).toBe(25);
      expect(stats.total_people).toBe(3);
      expect(stats.unindexed_faces).toBe(5);
    });

    test("unindexed faces count is tracked", async ({ page }) => {
      const unindexed = await page.evaluate(() => {
        return (window as any).__CATALOG_STORE__.getState().stats!.unindexed_faces;
      });
      expect(unindexed).toBe(5);
    });
  });
});
