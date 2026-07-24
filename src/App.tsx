import { open, save } from "@tauri-apps/plugin-dialog";
import Toolbar from "@/components/Toolbar";
import Sidebar from "@/components/Sidebar";
import GalleryGrid from "@/components/GalleryGrid";
import DetailsPanel from "@/components/DetailsPanel";
import { useCatalogStore } from "@/hooks/useCatalog";

const App: React.FC = () => {
  const { path, error, leftPanelVisible, rightPanelVisible } = useCatalogStore();

  const handleOpenCatalog = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: "Catalog",
          extensions: ["praetorian"],
        },
        {
          name: "All Files",
          extensions: ["*"],
        },
      ],
    });
    if (selected && typeof selected === "string") {
      await useCatalogStore.getState().openCatalog(selected);
    }
  };

  const handleCreateCatalog = async () => {
    const selected = await save({
      defaultPath: "library.praetorian",
      filters: [
        {
          name: "Catalog",
          extensions: ["praetorian"],
        },
      ],
    });
    console.log("save dialog result:", selected);
    if (selected && typeof selected === "string") {
      await useCatalogStore.getState().createCatalog(selected);
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#181818] overflow-hidden">
      <Toolbar />

      {path ? (
        <div className="flex-1 flex overflow-hidden">
          {leftPanelVisible && <Sidebar />}
          <div className="flex-1 flex flex-col overflow-hidden">
            <GalleryGrid />
            <FilmStrip />
          </div>
          {rightPanelVisible && <DetailsPanel />}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[#181818]">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <span className="text-3xl font-bold text-white">P</span>
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-[#d4d4d4]">
              Praetorian
            </h1>
            <p className="text-[13px] text-[#666] mt-1">
              Local-first photo library & cataloging
            </p>
          </div>
          <div className="flex gap-3">
            <button
              className="px-5 py-2 text-[13px] bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors font-medium shadow-md"
              onClick={handleOpenCatalog}
            >
              Open Catalog
            </button>
            <button
              className="px-5 py-2 text-[13px] bg-[#2a2a2a] hover:bg-[#333] text-white rounded-lg transition-colors font-medium border border-[#3a3a3a]"
              onClick={handleCreateCatalog}
            >
              New Catalog
            </button>
          </div>
          {error && (
            <p className="text-[12px] text-red-400 max-w-xs text-center">{error}</p>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Bottom film strip showing thumbnails of currently loaded images.
 * Acts as a quick navigation bar.
 */
function FilmStrip() {
  const { images, selectedImageIds, selectImage, clearSelection } =
    useCatalogStore();

  return (
    <div className="h-16 bg-[#1a1a1a] border-t border-[#2a2a2a] flex items-center px-2 gap-1 overflow-x-auto shrink-0">
      {images.map((img) => (
        <div
          key={img.id}
          className={`w-10 h-10 rounded shrink-0 cursor-pointer overflow-hidden transition-all ${
            selectedImageIds.has(img.id)
              ? "ring-1.5 ring-blue-500"
              : "opacity-60 hover:opacity-100"
          }`}
          onClick={() => {
            clearSelection();
            selectImage(img.id);
          }}
        >
          <MockThumb id={img.id} />
        </div>
      ))}
    </div>
  );
}

function MockThumb({ id }: { id: number }) {
  const hue1 = (id * 37) % 360;
  const hue2 = (hue1 + 40 + (id * 13) % 60) % 360;
  return (
    <div
      className="w-full h-full"
      style={{
        background: `linear-gradient(135deg, hsl(${hue1}, 15%, 20%), hsl(${hue2}, 20%, 25%))`,
      }}
    />
  );
}

export default App;
