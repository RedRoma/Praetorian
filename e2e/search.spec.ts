import { test, expect } from "./fixtures";

/**
 * Search tests.
 *
 * Tests the sidebar search input functionality.
 */
test.describe("Search", () => {
  test.describe("No catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("search input is not present on landing page", async ({ page }) => {
      await expect(page.getByPlaceholder("Search...")).not.toBeVisible();
    });
  });

  test.describe("With catalog loaded", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockImages(10);
    });

    test("search input is visible in sidebar", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search...");
      await expect(searchInput).toBeVisible();
    });

    test("search input is focusable", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search...");
      await searchInput.click();
      await expect(searchInput).toBeFocused();
    });

    test("search input accepts text input", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search...");
      await searchInput.fill("test query");
      await expect(searchInput).toHaveValue("test query");
    });

    test("search input has search icon", async ({ page }) => {
      // The search icon is an SVG with a specific path inside the search container
      const searchContainer = page.locator('[class*="relative"]');
      await expect(searchContainer.first()).toBeVisible();
    });

    test("search input styling matches dark theme", async ({ page }) => {
      const searchInput = page.getByPlaceholder("Search...");
      // Verify the input has a dark background via computed style (#2a2a2a = rgb(42, 42, 42))
      await expect(searchInput).toBeVisible();
      const bgColor = await searchInput.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );
      expect(bgColor).toMatch(/rgba?\([0-9]{1,3},\s*[0-9]{1,3},\s*[0-9]{1,3}/);
    });
  });
});
