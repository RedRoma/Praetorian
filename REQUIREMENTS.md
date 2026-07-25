# Project Requirements: Praetorian

## 1. Project Overview
**Praetorian** is a high-performance, local-first desktop photo library application. It serves as a privacy-focused alternative to cloud-based services, allowing users to organize, view, and manage large libraries of photos (including RAW files) entirely offline.

## 2. Tech Stack
*   **Core Framework:** Tauri v2 (System WebView).
*   **Backend Language:** Rust.
*   **Frontend:** React + TypeScript + Tailwind CSS.
*   **Database:** SQLite via **SQLx** (Compile-time checked, async runtime).
*   **Image Processing:** **libvips-sys** (for high-speed thumbnailing and Smart Previews).
*   **AI/ML:** **ONNX Runtime** with CUDA/Vulkan support (GPU acceleration).
*   **AI Model:** **RetinaFace** (Selected for high accuracy in face detection).
*   **External Bridge:** Python Subprocess (for AI upscaling tools).

## 3. Core Features

### A. The Catalog System
*   **Local Database:** The app uses a user-selectable `.praetorian` SQLite file as the source of truth.
*   **Import:** Ability to scan local directories (e.g., SD cards, external drives) and index photos into the catalog.
*   **Metadata:** Parse and store EXIF data (Camera, Lens, ISO, GPS, Date) to allow for fast filtering.

### B. Tiered Image Pipeline (Performance)
To ensure the UI remains snappy with large libraries, images are processed in three tiers:
1.  **Tiny Thumbnail:** Generated immediately for the grid view.
2.  **Smart Preview:** A high-quality, medium-resolution JPEG (e.g., 2048px) generated in the background. This is used for the single-image view.
3.  **Full Resolution:** Loaded on-demand for the full-screen viewer. The Rust backend reads the original file and returns it as a base64 data URL via `get_image_data`, since `file://` URLs are unavailable in Tauri's webview sandbox.

### C. Robust Image Handling
As a photography application, Praetorian must be able to display virtually any photo file. The image pipeline prioritizes showing images over perfect decoding:
*   **Multi-strategy decoding:** If the primary decoder fails (e.g., corrupted headers, unusual formats), the system automatically tries multiple fallback strategies before marking an image as unreadable.
*   **Graceful degradation:** Images with minor corruption should still be displayed if possible. Only completely unreadable files should fail.
*   **Wide format support:** The pipeline must handle standard formats (JPEG, PNG, TIFF, WebP) and RAW formats via libvips.

### D. Face Recognition
*   **Detection:** Background worker scans the library for faces using the **RetinaFace** model via ONNX.
*   **GPU Acceleration:** Must utilize Nvidia/AMD GPUs if available via CUDA execution providers.
*   **Organization:** Users can group detected faces and assign them names (e.g., "Sarah", "John").
*   **Search:** A search interface to query photos by person.

### E. Full-Screen Image Viewer
*   **Activation:** Double-click any thumbnail in the grid to open the full-screen viewer.
*   **Zoom:** Scroll wheel, +/− buttons, or +/− keys. Reset to 1:1 with the `0` key or reset button.
*   **Pan:** Click and drag when zoomed > 100%.
*   **Navigation:** Left/right arrow keys or on-screen buttons cycle through images in the catalog. Escape key closes the viewer.
*   **Info Bar:** Auto-hiding bottom bar shows filename, dimensions, file size, camera model, focal length, aperture, shutter speed, ISO, and image counter (e.g., `10 / 278`).
*   **Image Loading:** The Rust backend (`get_image_data` command) reads the original file and returns it as a base64 data URL, since `file://` URLs are unavailable in Tauri's webview sandbox. A loading spinner displays while the image loads.

### F. AI Upscaling (Python Bridge)
*   **Integration:** A Rust-to-Python bridge that spawns a subprocess to run external AI upscaling scripts (e.g., Real-ESRGAN).
*   **Workflow:** User selects image and desired image size -> Rust spawns Python script -> Script processes image -> Rust updates UI with success status.

## 4. UI/UX Guidelines
*   **Style:** "Lightroom Cloud" aesthetic. Clean, dark-mode default, minimal chrome. See a design mockup at [design/mockups/00000-4162059048.png].
*   **Layout:**
    *   **Left:** Sidebar for Folders/Albums.
    *   **Center:** Photo Grid (Virtual Scrolling).
    *   **Right:** Metadata Panel (EXIF details).
    *   **Full-Screen Overlay:** Activated by double-clicking a thumbnail. Shows the full-resolution image with zoom, pan, keyboard navigation, and an auto-hiding info bar.
*   **Responsiveness:** The main thread must never block. All image processing and AI tasks run in background async workers.

## 5. Development Roadmap
1.  **Stage 1 (Foundation):** Tauri setup, SQLx Schema, Directory Import, LibVips Thumbnailing, Basic Grid UI. ✅
2.  **Stage 2 (Smart Previews):** Implement the background worker for Smart Preview generation.
3.  **Stage 3 (Face AI):** Integrate ONNX Runtime + RetinaFace for background face indexing.
4.  **Stage 4 (Python Bridge):** Implement the subprocess bridge for upscaling.

## 6. Implemented Features
*   **Full-Screen Image Viewer** (`src/components/ImageViewer.tsx`) — Double-click any thumbnail to view full-resolution with zoom, pan, keyboard navigation, and an info bar. Backed by `get_image_data` Rust command (`src-tauri/src/lib.rs`). Viewer state managed in `useCatalog.ts` store.