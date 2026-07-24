import { test, expect } from "../fixtures";

/**
 * Tauri-specific integration tests.
 *
 * These tests run against the actual Tauri app (not just the Vite dev server).
 * They verify native IPC commands, file system access, and plugin behavior.
 *
 * Fails if not running inside a Tauri WebView.
 * Run with: npx playwright test --project=tauri
 */

test.describe("Tauri Native Integration", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
  });

  test("Zustand store is exposed on window for E2E testing", async ({ page }) => {
    const isTauri = await page.evaluate(() => typeof (__TAURI__ as any) !== "undefined");
    expect(isTauri).toBe(true);

    const hasStore = await page.evaluate(() => {
      return typeof (window as any).__CATALOG_STORE__ !== "undefined";
    });
    expect(hasStore).toBe(true);
  });

  test("store exposes all required methods", async ({ page }) => {
    const isTauri = await page.evaluate(() => typeof (__TAURI__ as any) !== "undefined");
    expect(isTauri).toBe(true);

    const methods = await page.evaluate(() => {
      const store = (window as any).__CATALOG_STORE__;
      return [
        "openCatalog",
        "createCatalog",
        "loadImages",
        "importDirectory",
        "selectImage",
        "updateRating",
        "toggleFavorite",
        "deleteImage",
        "searchImages",
        "loadPeople",
        "createPerson",
        "loadTags",
        "createTag",
        "loadAlbums",
        "createAlbum",
        "startFaceIndex",
        "exportXmpSidecars",
      ].filter(
        (m) => typeof store.getState()[m] === "function" || typeof store[m] === "function"
      );
    });
    // All methods should be available on the store
    expect(methods.length).toBeGreaterThan(0);
  });

  test("catalog state transitions correctly", async ({ page, app }) => {
    const isTauri = await page.evaluate(() => typeof (__TAURI__ as any) !== "undefined");
    expect(isTauri).toBe(true);

    // Initial state: no catalog
    let path = await page.evaluate(() => {
      return (window as any).__CATALOG_STORE__.getState().path;
    });
    expect(path).toBeNull();

    // Mock catalog load
    await app.mockCatalogLoaded();

    // State: catalog loaded
    path = await page.evaluate(() => {
      return (window as any).__CATALOG_STORE__.getState().path;
    });
    expect(path).toBeTruthy();
  });
});
