# Praetorian

> **The Local-First Photo Library for Creators.**  
> *High-performance, privacy-focused photo management built with Rust & Tauri.*

[Praetorian](https://github.com/RedRoma/praetorian) is a cross-platform desktop application designed to organize and manage your digital life without the cloud lock-in. Built on a foundation of **Rust** and **Tauri**, it delivers the raw speed of native software with the modern aesthetics of the web.

Whether you shoot Sony RAWs or have terabytes of family memories, Praetorian keeps everything local, fast, and under your control. No subscriptions. No tracking. Just your photos.

## Build and run commands

- `npm install` to install the frontend dependencies.
- `npm run dev` to start Vite in development.
- `npm run build` to build the frontend (`tsc && vite build`).
- `npm run tauri` to run the Tauri app.
- `npm run tauri build` to build the desktop application in `src-tauri/target/release`.

 ### Tests
- `npx playwright test --reporter=html` to run the headless ui tests.
- `npx playwright show-report` to show the results of the test.

---

## Why Praetorian?

Modern photo management has drifted toward the cloud. While convenient, services like Google Photos and Adobe Lightroom Cloud require constant internet access, push expensive subscriptions, or lock your data into proprietary catalogs.

**Praetorian brings back the power of local storage:**
*   **Privacy First:** Your photos never leave your hard drive unless you explicitly export them.
*   **Performance:** A tiered loading system ensures the app feels snappy even with millions of images.
*   **Modern Tech Stack:** Leveraging Rust for memory safety and speed, while providing a sleek React UI.

---

## ✨ Key Features

### AI-Powered Face Search
Praetorian uses local ONNX models to detect and recognize faces in your library. 
*   **Smart Recognition:** Automatically groups photos by person (e.g., "John", "Sarah").
*   **GPU Accelerated:** Utilizes Nvidia/AMD GPUs via CUDA/Vulkan for fast background processing.
*   **Re-indexing:** Full control over the AI pipeline; rebuild face indexes at will.

### Organization & Cataloging
*   **Lightroom-Style UI:** A clean, dark-mode interface inspired by modern cloud editors but running locally.
*   **Dual View System:** Browse your actual file system (**Folders**) or create virtual collections (**Albums**).
*   **Smart Previews:** A tiered loading pipeline (`Thumbnail` -> `Smart Preview` -> `Full RAW`) that makes browsing massive libraries instant.

### Editing & Metadata
*   **RAW Support:** Native support for mainstream camera formats (Sony ARW, Canon CR3, Nikon NEF).
*   **Metadata Management:** Rate photos 1-5 stars and manage IPTC/XMP sidecars directly from the app.
*   **AI Upscaling Bridge:** Integrated Python bridge to run external AI upscaling tools (like Real-ESRGAN) on selected images.

---

## 🛠 Tech Stack

Praetorian is built using a "Rust-first" architecture to ensure maximum efficiency and minimal memory footprint.

| Component | Technology | Purpose |
| :--- | :--- | :--- |
| **Core Framework** | **Tauri v2** | Lightweight, secure system integration. |
| **Backend Logic** | **Rust** | High-performance image processing & database management. |
| **UI Frontend** | **React + Tailwind** | Responsive, modern interface using virtual scrolling. |
| **Database** | **SQLite** | The "Catalog" file for fast metadata querying. |
| **Image Engine** | **libvips** | Industry-standard library for fast thumbnail generation. |
| **AI / ML** | **ONNX Runtime** | Local face detection with GPU acceleration support. |

---

## 📋 Roadmap

*   **[x] MVP:** Core architecture, SQLite cataloging, and basic photo viewing.
*   **[ ] Face Recognition:** Implement the background worker for YOLOv8-face detection.
*   **[ ] Smart Previews:** Build the tiered image pipeline (Thumbnail -> Preview).
*   **[ ] Import Wizard:** Drag-and-drop support for SD cards and external drives.
*   **[ ] Mobile App:** Port to iOS/Android using Tauri Mobile capabilities.

---

## Development & Installation

Prerequisites: [Rust](https://www.rust-lang.org/tools/install), [Node.js](https://nodejs.org/en).

```bash
# Clone the repository
git clone https://github.com/RedRoma/praetorian.git
cd praetorian

# Install dependencies
cargo install tauri-cli
npm install

# Run in development mode
cargo tauri dev
```

---

## License

Praetorian is licensed under the **Business Source License v1.1**. See `LICENSE` for more information.

---

**Made with _strength_ by [RedRoma](https://github.com/RedRoma)**