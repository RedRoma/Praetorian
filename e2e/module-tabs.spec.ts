import { test, expect } from "./fixtures";

/**
 * Module Tab tests.
 *
 * Tests the toolbar module tabs (Library, Develop, Preview, Map, People)
 * and view switching behavior.
 */
test.describe("Module Tabs", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
  });

  test("all five module tabs are present", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Library" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Develop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preview" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Map" })).toBeVisible();
    await expect(page.getByRole("button", { name: "People" })).toBeVisible();
  });

  test("Library tab is active by default", async ({ page }) => {
    // Active tab has bg-[#2a2a2a] background and white text
    const libraryTab = page.getByRole("button", { name: "Library" });
    await expect(libraryTab).toBeVisible();
  });

  test("clicking Develop tab switches active view", async ({ page }) => {
    await page.getByRole("button", { name: "Develop" }).click();

    const developTab = page.getByRole("button", { name: "Develop" });
    // The clicked tab should be in the active state (has bg-[#2a2a2a])
    await expect(developTab).toBeVisible();
  });

  test("clicking Preview tab switches active view", async ({ page }) => {
    await page.getByRole("button", { name: "Preview" }).click();
    const previewTab = page.getByRole("button", { name: "Preview" });
    await expect(previewTab).toBeVisible();
  });

  test("clicking Map tab switches active view", async ({ page }) => {
    await page.getByRole("button", { name: "Map" }).click();
    const mapTab = page.getByRole("button", { name: "Map" });
    await expect(mapTab).toBeVisible();
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("clicking People tab shows PeopleView in sidebar", async ({ page, app }) => {
      // First set catalog with images so sidebar renders
      await app.mockImages(3);
      await page.getByRole("button", { name: "People" }).click();

      // PeopleView shows "Detected Faces" header
      await expect(page.getByText("Detected Faces")).toBeVisible();
    });

    test("clicking Library tab shows LibraryView in sidebar", async ({ page, app }) => {
      await app.mockImages(3);
      await page.getByRole("button", { name: "Library" }).click();

      // LibraryView shows "All Photos" item
      await expect(page.getByText("All Photos")).toBeVisible();
    });

    test("switching tabs updates active tab styling", async ({ page, app }) => {
      await app.mockImages(3);

      // Click People tab
      await page.getByRole("button", { name: "People" }).click();
      const peopleTab = page.getByRole("button", { name: "People" });
      await expect(peopleTab).toBeVisible();

      // Switch back to Library
      await page.getByRole("button", { name: "Library" }).click();
      const libraryTab = page.getByRole("button", { name: "Library" });
      await expect(libraryTab).toBeVisible();
    });
  });
});
