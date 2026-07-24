import { create } from "zustand";
import {
  CatalogState,
  SidebarView,
  FolderRecord,
  ImageRecord,
  PersonRecord,
  TagRecord,
  AlbumRecord,
  CatalogStats,
  FaceRecord,
} from "@/types";
import * as catalogService from "@/services/catalog";

interface CatalogStore extends CatalogState {
  selectedImageIds: Set<number>;
  folders: FolderRecord[];
  people: PersonRecord[];
  tags: TagRecord[];
  albums: AlbumRecord[];
  stats: CatalogStats | null;
  activeView: SidebarView;
  leftPanelVisible: boolean;
  rightPanelVisible: boolean;

  // Catalog operations
  openCatalog: (path: string) => Promise<void>;
  createCatalog: (path: string) => Promise<void>;
  loadImages: (offset?: number, limit?: number) => Promise<void>;
  loadFolders: () => Promise<void>;
  loadStats: () => Promise<void>;

  // Import
  importDirectory: (dirPath: string) => Promise<number>;

  // Image selection
  selectImage: (id: number) => void;
  deselectImage: (id: number) => void;
  clearSelection: () => void;
  getSelectedImages: () => ImageRecord[];

  // Navigation
  setActiveView: (view: SidebarView) => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Rating & favorites
  updateRating: (id: number, rating: number) => Promise<void>;
  toggleFavorite: (id: number) => Promise<void>;

  // Archive & delete
  archiveImage: (id: number, isArchived: boolean) => Promise<void>;
  deleteImage: (id: number) => Promise<void>;
  deleteSelectedImages: () => Promise<void>;

  // Search & filter
  searchImages: (
    query: string,
    offset?: number,
    limit?: number
  ) => Promise<void>;

  // People
  loadPeople: () => Promise<void>;
  createPerson: (name: string) => Promise<void>;
  updatePersonName: (personId: number, name: string) => Promise<void>;
  deletePerson: (personId: number) => Promise<void>;
  assignFaceToPerson: (faceId: number, personId: number) => Promise<void>;
  unassignFaceFromPerson: (faceId: number) => Promise<void>;
  loadImagesForPerson: (personId: number) => Promise<void>;

  // Tags
  loadTags: () => Promise<void>;
  createTag: (name: string, color?: string) => Promise<void>;
  deleteTag: (tagId: number) => Promise<void>;
  tagImage: (imageId: number, tagId: number) => Promise<void>;
  untagImage: (imageId: number, tagId: number) => Promise<void>;

  // Albums
  loadAlbums: () => Promise<void>;
  createAlbum: (name: string, description?: string) => Promise<void>;
  deleteAlbum: (albumId: number) => Promise<void>;
  addImageToAlbum: (albumId: number, imageId: number) => Promise<void>;
  removeImageFromAlbum: (albumId: number, imageId: number) => Promise<void>;
  loadImagesForAlbum: (albumId: number) => Promise<void>;

  // Face detection
  startFaceIndex: () => Promise<void>;
  getFacesForImage: (imageId: number) => Promise<FaceRecord[]>;

  // Export
  exportXmpSidecars: (outputDir: string) => Promise<number>;
}

export const useCatalogStore = create<CatalogStore>((set, get) => ({
  path: null,
  images: [],
  totalImages: 0,
  isLoading: false,
  error: null,
  selectedImageIds: new Set(),
  folders: [],
  people: [],
  tags: [],
  albums: [],
  stats: null,
  activeView: "library",
  leftPanelVisible: true,
  rightPanelVisible: true,

  openCatalog: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      await catalogService.openCatalog(path);
      await get().loadImages();
      await get().loadFolders();
      await get().loadStats();
      set({ path, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to open catalog", isLoading: false });
    }
  },

  createCatalog: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      await catalogService.createCatalog(path);
      set({ path, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to create catalog", isLoading: false });
    }
  },

  loadImages: async (offset = 0, limit = 60) => {
    set({ isLoading: true, error: null });
    try {
      const [images, total] = await Promise.all([
        catalogService.listImages(offset, limit),
        catalogService.countImages(),
      ]);
      set({ images, totalImages: total, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to load images", isLoading: false });
    }
  },

  loadFolders: async () => {
    try {
      const folders = await catalogService.listFolders();
      set({ folders });
    } catch (e: any) {
      console.error("Failed to load folders:", e);
    }
  },

  loadStats: async () => {
    try {
      const stats = await catalogService.getCatalogStats();
      set({ stats });
    } catch (e: any) {
      console.error("Failed to load stats:", e);
    }
  },

  importDirectory: async (dirPath: string) => {
    set({ isLoading: true });
    try {
      const imported = await catalogService.importDirectory(dirPath);
      await get().loadImages();
      await get().loadFolders();
      await get().loadStats();
      set({ isLoading: false });
      return imported;
    } catch (e: any) {
      set({ error: e.message || "Failed to import directory", isLoading: false });
      throw e;
    }
  },

  selectImage: (id: number) => {
    const { selectedImageIds } = get();
    const next = new Set(selectedImageIds);
    next.add(id);
    set({ selectedImageIds: next });
  },

  deselectImage: (id: number) => {
    const { selectedImageIds } = get();
    const next = new Set(selectedImageIds);
    next.delete(id);
    set({ selectedImageIds: next });
  },

  clearSelection: () => {
    set({ selectedImageIds: new Set() });
  },

  getSelectedImages: () => {
    const { images, selectedImageIds } = get();
    return images.filter((img) => selectedImageIds.has(img.id));
  },

  setActiveView: (view: SidebarView) => {
    set({ activeView: view });
  },

  toggleLeftPanel: () => {
    set((s) => ({ leftPanelVisible: !s.leftPanelVisible }));
  },

  toggleRightPanel: () => {
    set((s) => ({ rightPanelVisible: !s.rightPanelVisible }));
  },

  updateRating: async (id: number, rating: number) => {
    try {
      await catalogService.updateRating(id, rating);
      set((s) => ({
        images: s.images.map((img) =>
          img.id === id ? { ...img, rating } : img
        ),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to update rating" });
    }
  },

  toggleFavorite: async (id: number) => {
    try {
      const newFavorite = await catalogService.toggleFavorite(id);
      set((s) => ({
        images: s.images.map((img) =>
          img.id === id ? { ...img, is_favorite: newFavorite } : img
        ),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to toggle favorite" });
    }
  },

  archiveImage: async (id: number, isArchived: boolean) => {
    try {
      await catalogService.archiveImage(id, isArchived);
      set((s) => ({
        images: s.images.filter((img) => img.id !== id),
        totalImages: s.totalImages - 1,
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to archive image" });
    }
  },

  deleteImage: async (id: number) => {
    try {
      await catalogService.deleteImage(id);
      set((s) => ({
        images: s.images.filter((img) => img.id !== id),
        totalImages: s.totalImages - 1,
        selectedImageIds: new Set(
          [...s.selectedImageIds].filter((x) => x !== id)
        ),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to delete image" });
    }
  },

  deleteSelectedImages: async () => {
    const { selectedImageIds } = get();
    if (selectedImageIds.size === 0) return;
    try {
      const ids = [...selectedImageIds];
      await catalogService.deleteImages(ids);
      set((s) => ({
        images: s.images.filter((img) => !selectedImageIds.has(img.id)),
        totalImages: s.totalImages - ids.length,
        selectedImageIds: new Set(),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to delete images" });
    }
  },

  searchImages: async (query: string, offset = 0, limit = 60) => {
    set({ isLoading: true });
    try {
      const [images, total] = await Promise.all([
        catalogService.searchImages(query, offset, limit),
        catalogService.countSearchResults(query),
      ]);
      set({ images, totalImages: total, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Search failed", isLoading: false });
    }
  },

  loadPeople: async () => {
    try {
      const people = await catalogService.listPeople();
      set({ people });
    } catch (e: any) {
      console.error("Failed to load people:", e);
    }
  },

  createPerson: async (name: string) => {
    try {
      await catalogService.createPerson(name);
      await get().loadPeople();
    } catch (e: any) {
      set({ error: e.message || "Failed to create person" });
    }
  },

  updatePersonName: async (personId: number, name: string) => {
    try {
      await catalogService.updatePersonName(personId, name);
      set((s) => ({
        people: s.people.map((p) =>
          p.id === personId ? { ...p, name, updated_at: new Date().toISOString() } : p
        ),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to update person name" });
    }
  },

  deletePerson: async (personId: number) => {
    try {
      await catalogService.deletePerson(personId);
      set((s) => ({
        people: s.people.filter((p) => p.id !== personId),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to delete person" });
    }
  },

  assignFaceToPerson: async (faceId: number, personId: number) => {
    try {
      await catalogService.assignFaceToPerson(faceId, personId);
    } catch (e: any) {
      set({ error: e.message || "Failed to assign face to person" });
    }
  },

  unassignFaceFromPerson: async (faceId: number) => {
    try {
      await catalogService.unassignFaceFromPerson(faceId);
    } catch (e: any) {
      set({ error: e.message || "Failed to unassign face" });
    }
  },

  loadImagesForPerson: async (personId: number) => {
    set({ isLoading: true });
    try {
      const images = await catalogService.filterByPerson(personId, 0, 1000);
      set({ images, totalImages: images.length, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to load images for person", isLoading: false });
    }
  },

  loadTags: async () => {
    try {
      const tags = await catalogService.listTags();
      set({ tags });
    } catch (e: any) {
      console.error("Failed to load tags:", e);
    }
  },

  createTag: async (name: string, color?: string) => {
    try {
      await catalogService.createTag(name, color ?? null);
      await get().loadTags();
    } catch (e: any) {
      set({ error: e.message || "Failed to create tag" });
    }
  },

  deleteTag: async (tagId: number) => {
    try {
      await catalogService.deleteTag(tagId);
      set((s) => ({
        tags: s.tags.filter((t) => t.id !== tagId),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to delete tag" });
    }
  },

  tagImage: async (imageId: number, tagId: number) => {
    try {
      await catalogService.tagImage(imageId, tagId);
    } catch (e: any) {
      set({ error: e.message || "Failed to tag image" });
    }
  },

  untagImage: async (imageId: number, tagId: number) => {
    try {
      await catalogService.untagImage(imageId, tagId);
    } catch (e: any) {
      set({ error: e.message || "Failed to untag image" });
    }
  },

  loadAlbums: async () => {
    try {
      const albums = await catalogService.listAlbums();
      set({ albums });
    } catch (e: any) {
      console.error("Failed to load albums:", e);
    }
  },

  createAlbum: async (name: string, description?: string) => {
    try {
      await catalogService.createAlbum(name, description ?? null);
      await get().loadAlbums();
    } catch (e: any) {
      set({ error: e.message || "Failed to create album" });
    }
  },

  deleteAlbum: async (albumId: number) => {
    try {
      await catalogService.deleteAlbum(albumId);
      set((s) => ({
        albums: s.albums.filter((a) => a.id !== albumId),
      }));
    } catch (e: any) {
      set({ error: e.message || "Failed to delete album" });
    }
  },

  addImageToAlbum: async (albumId: number, imageId: number) => {
    try {
      await catalogService.addImageToAlbum(albumId, imageId);
    } catch (e: any) {
      set({ error: e.message || "Failed to add image to album" });
    }
  },

  removeImageFromAlbum: async (albumId: number, imageId: number) => {
    try {
      await catalogService.removeImageFromAlbum(albumId, imageId);
    } catch (e: any) {
      set({ error: e.message || "Failed to remove image from album" });
    }
  },

  loadImagesForAlbum: async (albumId: number) => {
    set({ isLoading: true });
    try {
      const images = await catalogService.filterByAlbum(albumId, 0, 1000);
      set({ images, totalImages: images.length, isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Failed to load images for album", isLoading: false });
    }
  },

  startFaceIndex: async () => {
    set({ isLoading: true });
    try {
      await catalogService.startFaceIndex();
      await get().loadStats();
      set({ isLoading: false });
    } catch (e: any) {
      set({ error: e.message || "Face indexing failed", isLoading: false });
    }
  },

  getFacesForImage: async (imageId: number) => {
    return catalogService.getFacesForImage(imageId);
  },

  exportXmpSidecars: async (outputDir: string) => {
    const { selectedImageIds } = get();
    const ids = [...selectedImageIds];
    if (ids.length === 0) return 0;
    try {
      return await catalogService.exportXmpSidecars(ids, outputDir);
    } catch (e: any) {
      set({ error: e.message || "Failed to export XMP" });
      return 0;
    }
  },
}));

// Expose store on window for Playwright E2E testing
;(window as any).__CATALOG_STORE__ = useCatalogStore;
