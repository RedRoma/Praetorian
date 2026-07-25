import { useEffect, useCallback, useRef, useState } from "react";
import { useCatalogStore } from "@/hooks/useCatalog";
import { getImageData } from "@/services/catalog";

const ImageViewer: React.FC = () => {
  const {
    viewerImageId,
    zoomLevel,
    panX,
    panY,
    images,
    closeViewer,
    navigateViewer,
    setZoom,
    resetZoom,
    setPan,
  } = useCatalogStore();

  const image = images.find((img) => img.id === viewerImageId);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });
  const [showControls, setShowControls] = useState(true);
  const hideTimeout = useRef<ReturnType<typeof setTimeout>>();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch full-size image data
  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    setIsLoading(true);

    if (viewerImageId) {
      getImageData(viewerImageId)
        .then((dataUrl) => {
          if (!cancelled && dataUrl) {
            setImageUrl(dataUrl);
          }
        })
        .catch((err) => {
          console.error("[ImageViewer] Error loading image:", err);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [viewerImageId]);

  if (!image) {
    closeViewer();
    return null;
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          closeViewer();
          break;
        case "ArrowLeft":
          navigateViewer("prev");
          break;
        case "ArrowRight":
          navigateViewer("next");
          break;
        case "+":
        case "=":
          setZoom(zoomLevel * 1.25);
          break;
        case "-":
          setZoom(zoomLevel / 1.25);
          break;
        case "0":
          resetZoom();
          break;
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [closeViewer, navigateViewer, setZoom, resetZoom, zoomLevel]);

  // Mouse move to show/hide controls
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      setShowControls(true);
      if (hideTimeout.current) clearTimeout(hideTimeout.current);
      hideTimeout.current = setTimeout(() => {
        if (zoomLevel <= 1) setShowControls(false);
      }, 3000);

      if (!isDragging.current || zoomLevel <= 1) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setPan(panX + dx, panY + dy);
    },
    [zoomLevel, panX, panY, setPan]
  );

  // Pan via mouse drag when zoomed
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (zoomLevel <= 1) return;
      isDragging.current = true;
      lastMouse.current = { x: e.clientX, y: e.clientY };
    },
    [zoomLevel]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  // Scroll zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(zoomLevel * delta);
    },
    [zoomLevel, setZoom]
  );

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const exif = image.exif;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center select-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeViewer();
      }}
    >
      {/* Close button */}
      <button
        className={`absolute top-4 right-4 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-all ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={closeViewer}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Navigation arrows */}
      <button
        className={`absolute left-4 top-1/2 -translate-y-1/2 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-all ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => navigateViewer("prev")}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <button
        className={`absolute right-4 top-1/2 -translate-y-1/2 z-50 w-10 h-10 flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-all ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
        onClick={() => navigateViewer("next")}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Image */}
      <div
        className="transition-none"
        style={{
          transform: `scale(${zoomLevel}) translate(${panX / zoomLevel}px, ${panY / zoomLevel}px)`,
          cursor: zoomLevel > 1 ? (isDragging.current ? "grabbing" : "grab") : "default",
        }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={image.file_name}
            className="max-w-[90vw] max-h-[90vh] object-contain"
            draggable={false}
          />
        ) : isLoading ? (
          <div className="w-16 h-16 border-2 border-white/20 border-t-white/70 rounded-full animate-spin" />
        ) : null}
      </div>

      {/* Bottom bar: zoom controls + info */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 flex items-end justify-center pb-4 transition-opacity ${
          showControls ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-2.5 flex items-center gap-4">
          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded hover:bg-white/10 transition-colors"
              onClick={() => setZoom(zoomLevel / 1.25)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
              </svg>
            </button>
            <span className="text-white/70 text-xs w-12 text-center font-mono">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              className="w-8 h-8 flex items-center justify-center text-white/70 hover:text-white rounded hover:bg-white/10 transition-colors"
              onClick={() => setZoom(zoomLevel * 1.25)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
            <button
              className="w-8 h-8 flex items-center justify-center text-white/50 hover:text-white rounded hover:bg-white/10 transition-colors text-xs font-medium"
              onClick={resetZoom}
              title="Reset zoom"
            >
              1:1
            </button>
          </div>

          <div className="w-px h-6 bg-white/20" />

          {/* Image info */}
          <div className="flex items-center gap-3 text-xs text-white/60">
            <span className="font-medium text-white/80 truncate max-w-[180px]">{image.file_name}</span>
            {image.width && image.height && (
              <span>{image.width} × {image.height}</span>
            )}
            <span>{formatSize(image.file_size_bytes)}</span>

            {/* EXIF data */}
            {exif && exif.camera_model && (
              <>
                <div className="w-px h-4 bg-white/20" />
                <span>{exif.camera_make && `${exif.camera_make} `}{exif.camera_model}</span>
              </>
            )}
            {exif && exif.focal_length_mm && (
              <span>{exif.focal_length_mm}mm</span>
            )}
            {exif && exif.aperture_f_number && (
              <span>f/{exif.aperture_f_number}</span>
            )}
            {exif && exif.shutter_speed_num && exif.shutter_speed_den && (
              <span>
                1/{Math.round(exif.shutter_speed_den / exif.shutter_speed_num)}s
              </span>
            )}
            {exif && exif.iso && <span>ISO {exif.iso}</span>}
          </div>

          {/* Image counter */}
          <div className="w-px h-6 bg-white/20" />
          <span className="text-xs text-white/40 font-mono">
            {images.findIndex((img) => img.id === viewerImageId) + 1} / {images.length}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ImageViewer;
