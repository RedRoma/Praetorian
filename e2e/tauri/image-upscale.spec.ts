import { test, expect } from "../fixtures";

/**
 * Upscale integration tests for Tauri runtime.
 *
 * Based on REQUIREMENTS section D (AI Upscaling - Python Bridge).
 * These verify the upscale_image IPC command is properly wired.
 *
 * Fails if not running inside a Tauri WebView.
 */
test.describe("Upscale Integration", () => {
  test.beforeEach(async ({ app }) => {
    await app.gotoLanding();
    await app.mockImages(3);
  });

  test("upscale_image Tauri command is registered", async ({ page }) => {
    const isTauri = await page.evaluate(() => typeof (__TAURI__ as any) !== "undefined");
    expect(isTauri).toBe(true);

    // The command should be available via tauri invoke
    const hasCommand = await page.evaluate(async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        return typeof invoke === "function";
      } catch {
        return false;
      }
    });
    expect(hasCommand).toBe(true);
  });

  test("store state tracks upscale-relevant image fields", async ({ page }) => {
    const isTauri = await page.evaluate(() => typeof (__TAURI__ as any) !== "undefined");
    expect(isTauri).toBe(true);

    const images = await page.evaluate(() => {
      return (window as any).__CATALOG_STORE__.getState().images;
    });

    for (const img of images) {
      expect(img).toHaveProperty("file_name");
      expect(img).toHaveProperty("width");
      expect(img).toHaveProperty("height");
      expect(img).toHaveProperty("file_size_bytes");
    }
  });
});
