import { useCallback, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCatalogStore } from "@/hooks/useCatalog";
import Thumbnail from "@/components/Thumbnail";

const COLUMNS = 5;
const ITEM_HEIGHT = 180;

const GalleryGrid: React.FC = () => {
  const { images, selectedImageIds, selectImage, deselectImage, clearSelection } =
    useCatalogStore();

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log(`[GalleryGrid] Images loaded: ${images.length}`);
    if (images.length > 0) {
      console.log(`[GalleryGrid] First image id=${images[0].id}, has_thumbnail=${images[0].has_thumbnail}`);
      const withThumb = images.filter(i => i.has_thumbnail).length;
      console.log(`[GalleryGrid] With thumbnails: ${withThumb}/${images.length}`);
    }
  }, [images.length]);

  const totalItems = images.length;
  const totalRows = Math.ceil(totalItems / COLUMNS);

  const virtualizer = useVirtualizer({
    count: totalRows,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: 10,
  });

  const handleSelect = useCallback(
    (id: number, e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (selectedImageIds.has(id)) {
          deselectImage(id);
        } else {
          selectImage(id);
        }
      } else {
        clearSelection();
        selectImage(id);
      }
    },
    [selectedImageIds, selectImage, deselectImage, clearSelection]
  );

  if (images.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#181818]">
        <p className="text-[13px] text-[#555]">No images in catalog</p>
      </div>
    );
  }

  return (
    <div
      ref={parentRef}
      className="flex-1 w-full min-h-0 overflow-auto bg-[#181818]"
      style={{ contain: "strict" }}
      onClick={() => clearSelection()}
    >
      <div
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const startIndex = virtualRow.index * COLUMNS;
          const rowImages = images.slice(startIndex, startIndex + COLUMNS);

          if (rowImages.length === 0 && virtualRow.index < 3) {
            console.warn(`[GalleryGrid] Row ${virtualRow.index} has no images! start=${startIndex}, totalItems=${totalItems}`);
          }

          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div
                className="flex gap-1 p-1"
                onClick={(e) => e.stopPropagation()}
              >
                {rowImages.map((img) => (
                  <div
                    key={img.id}
                    className="flex-1 min-w-0"
                    style={{
                      flex: `0 0 calc((100% - ${4 * (COLUMNS - 1)}px) / ${COLUMNS})`,
                    }}
                  >
                    <Thumbnail
                      image={img}
                      isSelected={selectedImageIds.has(img.id)}
                      onSelect={(id) => handleSelect(id, {} as React.MouseEvent)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default GalleryGrid;
