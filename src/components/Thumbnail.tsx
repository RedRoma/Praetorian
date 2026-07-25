import { memo, useState, useEffect } from "react";
import { ImageRecord } from "@/types";
import { getThumbnailData } from "@/services/catalog";

interface ThumbnailProps {
  image: ImageRecord;
  isSelected: boolean;
  onSelect: (id: number) => void;
  onDoubleClick?: (id: number) => void;
}

const Thumbnail = memo(({ image, isSelected, onSelect, onDoubleClick }: ThumbnailProps) => {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setThumbnailUrl(null);
    setIsLoading(true);

    getThumbnailData(image.id)
      .then((dataUrl) => {
        if (!cancelled && dataUrl) {
          console.log(`[Thumbnail] Loaded for image ${image.id}, size=${dataUrl.length}`);
          setThumbnailUrl(dataUrl);
        } else if (!cancelled) {
          console.log(`[Thumbnail] No thumbnail data for image ${image.id}`);
        }
      })
      .catch((err) => {
        console.error(`[Thumbnail] Error loading image ${image.id}:`, err);
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [image.id]);

  return (
    <div
      className={`relative aspect-square bg-[#222] rounded overflow-hidden cursor-pointer transition-all ${
        isSelected
          ? "ring-2 ring-blue-500 ring-offset-1 ring-offset-[#181818]"
          : "hover:ring-1 hover:ring-[#444]"
      }`}
      onClick={() => onSelect(image.id)}
      onDoubleClick={() => onDoubleClick?.(image.id)}
    >
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt={image.file_name}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : isLoading ? (
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-[#444] border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <MockImage id={image.id} />
      )}

      {/* Rating overlay */}
      {image.rating > 0 && (
        <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-0.5 py-1 bg-gradient-to-t from-black/70 to-transparent">
          {Array.from({ length: image.rating }).map((_, i) => (
            <svg
              key={i}
              className="w-2.5 h-2.5 text-yellow-400 fill-current"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>
      )}

      {/* Favorite indicator */}
      {image.is_favorite && (
        <div className="absolute top-1 right-1">
          <svg className="w-3.5 h-3.5 text-red-400 fill-current" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      )}

      {/* Extension badge */}
      <div className="absolute top-1 left-1 bg-black/60 text-[9px] text-[#aaa] px-1 py-0.5 rounded font-mono uppercase">
        {image.file_extension}
      </div>
    </div>
  );
});

Thumbnail.displayName = "Thumbnail";
export default Thumbnail;

/**
 * Generates a deterministic gradient placeholder based on image ID.
 * Shown when thumbnail is unavailable or failed to load.
 */
function MockImage({ id }: { id: number }) {
  const hue1 = (id * 37) % 360;
  const hue2 = (hue1 + 40 + (id * 13) % 60) % 360;
  const angle = (id * 47) % 360;
  const sat = 25 + (id * 7) % 25;
  const light = 30 + (id * 3) % 18;

  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{
        background: `linear-gradient(${angle}deg, hsl(${hue1}, ${sat}%, ${light}%), hsl(${hue2}, ${sat + 5}%, ${light + 8}%))`,
      }}
    >
      <span className="text-[9px] text-white/40 font-mono">{id}</span>
    </div>
  );
}
