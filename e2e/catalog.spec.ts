import { test, expect } from "./fixtures";

/**
 * Catalog management tests.
 *
 * Tests catalog open, create, and import workflow.
 * Based on REQUIREMENTS section A (Catalog System).
 */
test.describe("Catalog Management", () => {
  test.describe("Open Catalog", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("Open Catalog button is available on landing page", async ({ page }) => {
      const openBtn = page.getByRole("button", { name: "Open Catalog" }).first();
      await expect(openBtn).toBeVisible();
      await expect(openBtn).toBeEnabled();
    });

    test("toolbar does not show Import button before catalog is loaded", async ({ page }) => {
      const importBtn = page.getByTestId("import-button");
      await expect(importBtn).not.toBeVisible();
    });
  });

  test.describe("Create Catalog", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
    });

    test("New Catalog button is available on landing page", async ({ page }) => {
      const newBtn = page.getByRole("button", { name: "New Catalog" });
      await expect(newBtn).toBeVisible();
      await expect(newBtn).toBeEnabled();
    });
  });

  test.describe("Import", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("Import button is visible after catalog load", async ({ page }) => {
      const importBtn = page.getByTestId("import-button");
      await expect(importBtn).toBeVisible();
      await expect(importBtn).toBeEnabled();
    });

    test("Import button has correct styling", async ({ page }) => {
      const importBtn = page.getByTestId("import-button");
      const classes = await importBtn.getAttribute("class");
      expect(classes).toContain("bg-blue-600");
    });
  });

  test.describe("Catalog loaded state", () => {
    test.beforeEach(async ({ app }) => {
      await app.gotoLanding();
      await app.mockCatalogLoaded();
    });

    test("sidebar becomes visible after catalog load", async ({ page }) => {
      const sidebar = page.locator('[class*="w-56"]');
      await expect(sidebar).toBeVisible();
    });

    test("toolbar shows panel toggle buttons", async ({ page }) => {
      await expect(page.getByRole("button", { name: /Sidebar/i })).toBeVisible();
      await expect(page.getByRole("button", { name: /Details/i })).toBeVisible();
    });

    test("Open Catalog button is hidden when catalog is loaded", async ({ page }) => {
      const openBtn = page.getByRole("button", { name: "Open Catalog" });
      await expect(openBtn).not.toBeVisible();
    });

    test("New Catalog button is hidden when catalog is loaded", async ({ page }) => {
      const newBtn = page.getByRole("button", { name: "New Catalog" });
      await expect(newBtn).not.toBeVisible();
    });
  });
});
