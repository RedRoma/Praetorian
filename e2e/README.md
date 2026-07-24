# E2E Tests

Playwright end-to-end tests for the Praetorian app.

## Quick Start

```bash
# 1. Start the Vite dev server in one terminal
npm run dev

# 2. Run tests in another terminal
npm run test:e2e          # headless, text output
npm run test:e2e:headed   # headless, shows browser
npm run test:e2e:ui       # Playwright UI mode (interactive)
npm run test:e2e:debug    # debug mode, step through tests
```

## What Works With Playwright Alone

Playwright drives the Vite dev server on `localhost:1420`. This gives you a Chromium browser pointing at your React frontend. Everything that runs in the browser works:

- **Visual assertions** — buttons exist, text is visible, components render
- **User interactions** — clicking toolbar tabs, typing in search inputs
- **State that starts in code** — default store values, initial UI layout

## What Requires Tauri Runtime

The following only work inside the actual Tauri app window, not in Playwright's browser:

| Feature | Why It Doesn't Work | How to Test |
|---------|---------------------|-------------|
| File dialogs (`open`, `save`) | Native OS dialog, not web API | Test via `tauri-driver` + WebDriver protocol |
| File system access (`@tauri-apps/plugin-fs`) | Rust backend calls | Unit test the Rust side with `cargo test` |
| Shell commands (`@tauri-apps/plugin-shell`) | Native process spawning | Unit test the Rust side |
| Deep linking / Tauri events | Tauri IPC bridge | Integration test in Tauri runtime |

## Testing "Catalog Loaded" State

The app has two main states: landing page (no catalog) and workspace (catalog loaded). The workspace state requires the Zustand store to have `path` set, which normally happens after the user picks a file via Tauri's native dialog.

**Option A: Expose the store for testing**

In `src/hooks/useCatalog.ts`, add this line at the bottom:

```ts
;(window as any).__CATALOG_STORE__ = useCatalogStore;
```

Then in your Playwright tests:

```ts
await page.evaluate(() => {
  (window as any).__CATALOG_STORE__.setState({ path: '/fake/catalog.praetorian' });
});
```

**Option B: Use tauri-driver for real WebView testing**

```toml
# Cargo.toml dev-dependencies
tauri-driver = { version = "2", features = ["dev"] }
```

This runs your actual compiled Tauri app and exposes it via WebDriver protocol. You can use Selenium bindings or Playwright's `--connect-to-browser` against the real window. This is heavier but gives you true end-to-end coverage including native APIs.

## Adding New Tests

1. Create a new `.spec.ts` file in the `e2e/` directory
2. Import from `./fixtures` instead of directly from `@playwright/test`
3. Use the `app.gotoLanding()` helper to navigate before each test
4. Follow the naming convention: `<component>.spec.ts`

## Project Structure

```
e2e/
├── fixtures.ts        # Base test fixtures
├── landing.spec.ts    # Landing page (no catalog)
├── toolbar.spec.ts    # Toolbar component
├── sidebar.spec.ts    # Sidebar component
└── README.md          # This file
```
