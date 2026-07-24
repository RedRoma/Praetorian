import { useCatalogStore } from "@/hooks/useCatalog";
import { open } from "@tauri-apps/plugin-dialog";

const Toolbar: React.FC = () => {
  const { path, leftPanelVisible, rightPanelVisible, toggleLeftPanel, toggleRightPanel } =
    useCatalogStore();

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

  const handleImport = async () => {
    const selected = await open({ directory: true });
    if (selected && typeof selected === "string") {
      await useCatalogStore.getState().importDirectory(selected);
    }
  };

  return (
    <div className="h-10 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-3 gap-1 shrink-0 select-none">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
          <span className="text-[10px] font-bold text-white">P</span>
        </div>
        <span className="text-[13px] font-semibold text-[#d4d4d4] tracking-wide">
          Praetorian
        </span>
      </div>

      {/* Module tabs */}
      <div className="flex items-center gap-0.5">
        <ModuleTab label="Library" active />
        <ModuleTab label="Develop" />
        <ModuleTab label="Preview" />
        <ModuleTab label="Map" />
        <ModuleTab label="People" />
      </div>

      <div className="flex-1" />

      {/* Right side actions */}
      {path && (
        <>
          <button
            data-testid="toggle-sidebar"
            className="px-2.5 py-1 text-[12px] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"
            onClick={toggleLeftPanel}
          >
            {leftPanelVisible ? "Hide" : "Show"} Sidebar
          </button>
          <button
            data-testid="toggle-details"
            className="px-2.5 py-1 text-[12px] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a] rounded transition-colors"
            onClick={toggleRightPanel}
          >
            {rightPanelVisible ? "Hide" : "Show"} Details
          </button>
          <div className="w-px h-5 bg-[#2a2a2a] mx-1" />
          <button
            data-testid="import-button"
            className="px-3 py-1 text-[12px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
            onClick={handleImport}
          >
            Import
          </button>
        </>
      )}

      {!path && (
        <button
          className="px-3 py-1 text-[12px] bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors font-medium"
          onClick={handleOpenCatalog}
        >
          Open Catalog
        </button>
      )}
    </div>
  );
};

function ModuleTab({ label, active = false }: { label: string; active?: boolean }) {
  const setActive = (view: string) => {
    const map: Record<string, any> = {
      Library: "library",
      Develop: "develop",
      Preview: "preview",
      Map: "map",
      People: "people",
    };
    useCatalogStore.getState().setActiveView(map[view] as any);
  };

  return (
    <button
      className={`px-3 py-1.5 text-[12px] font-medium rounded transition-colors ${
        active
          ? "bg-[#2a2a2a] text-white"
          : "text-[#888] hover:text-[#ccc] hover:bg-[#222]"
      }`}
      onClick={() => setActive(label)}
    >
      {label}
    </button>
  );
}

export default Toolbar;
