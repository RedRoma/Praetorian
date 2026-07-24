import { test as base } from "@playwright/test";

/**
 * Base fixture for Praetorian E2E tests.
 *
 * The app runs on the Vite dev server (localhost:1420).
 * For local Playwright testing, run `npm run dev` first.
 *
 * IMPORTANT LIMITATIONS:
 * - Tauri native APIs (file dialogs, fs access, shell commands) do NOT work
 *   in Playwright's browser context. They only work inside the actual Tauri runtime.
 * - Zustand store state cannot be manipulated from outside unless explicitly
 *   exposed on `window`. Tests that require a loaded catalog should either:
 *   1. Expose the store on window for testing: `window.__CATALOG_STORE__ = useCatalogStore`
 *   2. Run integration tests through `tauri dev` with WebDriver/tauri-driver instead
 */
export interface AppFixture {
  app: {
    /** Navigate to the app root. Use before each test that needs a fresh page. */
    gotoLanding: () => Promise<void>;
    /** Mock a loaded catalog by setting Zustand store state via window. */
    mockCatalogLoaded: () => Promise<void>;
    /** Mock images in the catalog store for testing grid and details panel. */
    mockImages: (count?: number) => Promise<void>;
    /** Clear any mocked store state. */
    clearMockState: () => Promise<void>;
    /** Mock people in the catalog store. */
    mockPeople: (people: Array<{ id: number; name: string; faceCount: number }>) => Promise<void>;
    /** Mock tags in the catalog store. */
    mockTags: (tags: Array<{ id: number; name: string; color?: string | null }>) => Promise<void>;
    /** Mock albums in the catalog store. */
    mockAlbums: (albums: Array<{ id: number; name: string }>) => Promise<void>;
    /** Mock catalog stats in the store. */
    mockStats: (stats: { totalImages: number; totalFaces: number; totalPeople: number; unindexedFaces: number }) => Promise<void>;
  };
}

export const test = base.extend<AppFixture>({
  app: async ({ page }, use) => {
    await use({
      gotoLanding: async () => {
        await page.goto("/");
      },
      mockCatalogLoaded: async () => {
        await page.evaluate(() => {
          (window as any).__CATALOG_STORE__.setState({
            path: "/fake/catalog.praetorian",
            leftPanelVisible: true,
            rightPanelVisible: true,
            activeView: "library",
            images: [],
            folders: [],
            people: [],
            tags: [],
            albums: [],
            stats: null,
            selectedImageIds: new Set(),
            isLoading: false,
            error: null,
            totalImages: 0,
          });
        });
      },
      mockImages: async (count = 6) => {
        const images = Array.from({ length: count }, (_, i) => ({
          id: i + 1,
          file_name: `image_${i + 1}.jpg`,
          file_extension: "jpg",
          file_size_bytes: 5000000 + i * 100000,
          width: 4000 + i * 100,
          height: 3000 + i * 50,
          date_taken: "2025-06-15T10:30:00Z",
          date_imported: "2025-07-01T08:00:00Z",
          rating: i % 3,
          is_favorite: i === 0,
          has_thumbnail: i < 4,
          has_preview: i < 2,
          faces_indexed: i < 3,
          exif: {
            camera_make: "Canon",
            camera_model: "EOS R5",
            lens_model: "RF 24-70mm f/2.8L",
            iso: 100 + i * 100,
            aperture_f_number: 2.8 + i * 0.5,
            shutter_speed_den: 125 + i * 10,
            focal_length_mm: 50 + i * 5,
            gps_latitude: 40.7128 + i * 0.001,
            gps_longitude: -74.006 + i * 0.001,
            gps_altitude: 10 + i,
          },
        }));

        await page.evaluate((imgs) => {
          (window as any).__CATALOG_STORE__.setState({
            path: "/fake/catalog.praetorian",
            leftPanelVisible: true,
            rightPanelVisible: true,
            activeView: "library",
            images: imgs,
            folders: [{ id: 1, name: "DCIM" }, { id: 2, name: "Photos" }],
            people: [],
            tags: [],
            albums: [],
            stats: null,
            selectedImageIds: new Set(),
            isLoading: false,
            error: null,
            totalImages: imgs.length,
          });
        }, images);
      },
      clearMockState: async () => {
        await page.evaluate(() => {
          (window as any).__CATALOG_STORE__.setState({
            path: null,
            leftPanelVisible: true,
            rightPanelVisible: true,
            activeView: "library",
            images: [],
            folders: [],
            people: [],
            tags: [],
            albums: [],
            stats: null,
            selectedImageIds: new Set(),
            isLoading: false,
            error: null,
            totalImages: 0,
          });
        });
      },
      mockPeople: async (people) => {
        await page.evaluate((ppl) => {
          const store = (window as any).__CATALOG_STORE__;
          const state = store.getState();
          store.setState({
            ...state,
            people: ppl.map(({ id, name, faceCount }) => ({
              id,
              name,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              face_count: faceCount,
            })),
          });
        }, people);
      },
      mockTags: async (tags) => {
        await page.evaluate((tgs) => {
          const store = (window as any).__CATALOG_STORE__;
          const state = store.getState();
          store.setState({
            ...state,
            tags: tgs.map(({ id, name, color }) => ({
              id,
              name,
              color: color ?? null,
            })),
          });
        }, tags);
      },
      mockAlbums: async (albums) => {
        await page.evaluate((albs) => {
          const store = (window as any).__CATALOG_STORE__;
          const state = store.getState();
          store.setState({
            ...state,
            albums: albs.map(({ id, name }) => ({
              id,
              name,
              description: null,
              created_at: new Date().toISOString(),
            })),
          });
        }, albums);
      },
      mockStats: async (stats) => {
        await page.evaluate((s) => {
          const store = (window as any).__CATALOG_STORE__;
          const state = store.getState();
          store.setState({
            ...state,
            stats: {
              total_images: s.totalImages,
              total_faces: s.totalFaces,
              total_people: s.totalPeople,
              total_folders: 2,
              total_tags: 0,
              unindexed_faces: s.unindexedFaces,
              missing_files: 0,
            },
          });
        }, stats);
      },
    });
  },
});

export { expect } from "@playwright/test";
