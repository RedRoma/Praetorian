import { useState } from "react";
import { useCatalogStore } from "@/hooks/useCatalog";

const Sidebar: React.FC = () => {
  const { folders, activeView, totalImages } = useCatalogStore();

  return (
    <div className="w-56 bg-[#1e1e1e] border-r border-[#2a2a2a] flex flex-col overflow-hidden shrink-0">
      {/* Search */}
      <div className="p-2">
        <div className="relative">
          <svg
            className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#666]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            className="w-full bg-[#2a2a2a] text-[12px] text-[#ccc] placeholder-[#666] rounded pl-7 pr-2 py-1.5 outline-none border border-transparent focus:border-[#3a3a3a] transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeView === "library" && (
          <LibraryView folders={folders} totalImages={totalImages} />
        )}
        {activeView === "people" && <PeopleView />}
      </div>

      {/* Bottom status */}
      <div className="border-t border-[#2a2a2a] p-2 text-[11px] text-[#555]">
        Catalog: {totalImages} images
      </div>
    </div>
  );
};

function LibraryView({ folders, totalImages }: { folders: any[]; totalImages: number }) {
  return (
    <div className="py-1">
      <SectionHeader label="Catalog" defaultOpen />
      <div className="ml-2">
        <SidebarItem
          icon={
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          label="All Photos"
          count={totalImages}
          active
        />
        <SidebarItem
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          }
          label="Favorites"
        />
        <SidebarItem
          icon={
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          }
          label="Rated"
        />
      </div>

      <SectionHeader label="Folders" defaultOpen />
      <div className="ml-2">
        {folders.map((folder) => (
          <SidebarItem
            key={folder.id}
            icon={
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
            }
            label={folder.name}
            indent={1}
          />
        ))}
      </div>
    </div>
  );
}

function PeopleView() {
  const people = ["Unknown Person 1", "Unknown Person 2", "Unknown Person 3"];
  return (
    <div className="py-1 px-2">
      <p className="text-[11px] text-[#555] uppercase tracking-wider font-semibold mb-2">
        Detected Faces
      </p>
      {people.map((name, i) => (
        <div key={i} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-[#2a2a2a] cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-[#333] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#666]" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
            </svg>
          </div>
          <span className="text-[12px] text-[#ccc] truncate">{name}</span>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  label,
  defaultOpen = true,
}: {
  label: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <button
      className="w-full flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-[#777] uppercase tracking-wider hover:text-[#aaa] transition-colors"
      onClick={() => setOpen(!open)}
    >
      <svg
        className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
        fill="currentColor"
        viewBox="0 0 24 24"
      >
        <path d="M8 5v14l11-7z" />
      </svg>
      {label}
    </button>
  );
}

function SidebarItem({
  icon,
  label,
  count,
  active = false,
  indent = 0,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  indent?: number;
}) {
  return (
    <div
      className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer text-[12px] transition-colors ${
        active ? "bg-[#2a2a2a] text-white" : "text-[#aaa] hover:bg-[#262626] hover:text-[#ddd]"
      }`}
      style={{ paddingLeft: `${indent * 8 + 8}px` }}
    >
      <span className="text-[#666] shrink-0">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {count !== undefined && (
        <span className="text-[11px] text-[#555]">{count}</span>
      )}
    </div>
  );
}

export default Sidebar;
