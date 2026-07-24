import { invoke } from "@tauri-apps/api/core";
import {
  ImageRecord,
  FolderRecord,
  ExifData,
  FaceRecord,
  PersonRecord,
  TagRecord,
  AlbumRecord,
  CatalogStats,
} from "../types";

// ============================================
// CATALOG
// ============================================

export async function openCatalog(path: string): Promise<void> {
  return invoke<void>("open_catalog", { path });
}

export async function createCatalog(path: string): Promise<void> {
  return invoke<void>("create_catalog", { path });
}

export async function getCatalogStats(): Promise<CatalogStats> {
  return invoke<CatalogStats>("get_catalog_stats");
}

// ============================================
// IMPORT
// ============================================

export async function importDirectory(dirPath: string): Promise<number> {
  return invoke<number>("import_directory", { dirPath });
}

// ============================================
// IMAGE LISTING
// ============================================

export async function listImages(
  offset: number,
  limit: number,
  ratingFilter?: number | null
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("list_images", {
    offset,
    limit,
    ratingFilter: ratingFilter ?? null,
  });
}

export async function countImages(): Promise<number> {
  return invoke<number>("count_images");
}

export async function listFolders(): Promise<FolderRecord[]> {
  return invoke<FolderRecord[]>("list_folders");
}

// ============================================
// IMAGE DETAILS
// ============================================

export async function getImageDetails(
  imageId: number
): Promise<ImageRecord & { exif?: ExifData | null }> {
  return invoke<any>("get_image_details", { imageId });
}

// ============================================
// THUMBNAILS & PREVIEWS
// ============================================

export async function getThumbnailPath(imageId: number): Promise<string> {
  return invoke<string>("get_thumbnail_path", { imageId });
}

export async function getThumbnailData(imageId: number): Promise<string> {
  return invoke<string>("get_thumbnail_data", { imageId });
}

export async function getPreviewPath(imageId: number): Promise<string> {
  return invoke<string>("get_preview_path", { imageId });
}

// ============================================
// RATING & FAVORITES
// ============================================

export async function updateRating(
  imageId: number,
  rating: number
): Promise<void> {
  return invoke<void>("update_rating", { imageId, rating });
}

export async function toggleFavorite(imageId: number): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { imageId });
}

export async function setFavorite(
  imageId: number,
  isFavorite: boolean
): Promise<void> {
  return invoke<void>("set_favorite", { imageId, isFavorite });
}

// ============================================
// ARCHIVE & DELETE
// ============================================

export async function archiveImage(
  imageId: number,
  isArchived: boolean
): Promise<void> {
  return invoke<void>("archive_image", { imageId, isArchived });
}

export async function deleteImage(imageId: number): Promise<void> {
  return invoke<void>("delete_image", { imageId });
}

export async function deleteImages(imageIds: number[]): Promise<number> {
  return invoke<number>("delete_images", { imageIds });
}

// ============================================
// SEARCH & FILTER
// ============================================

export async function searchImages(
  query: string,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("search_images", { query, offset, limit });
}

export async function countSearchResults(query: string): Promise<number> {
  return invoke<number>("count_search_results", { query });
}

export async function filterByCamera(
  cameraModel: string,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("filter_by_camera", {
    cameraModel,
    offset,
    limit,
  });
}

export async function filterByLens(
  lensModel: string,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("filter_by_lens", {
    lensModel,
    offset,
    limit,
  });
}

export async function filterByPerson(
  personId: number,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("filter_by_person", {
    personId,
    offset,
    limit,
  });
}

export async function filterByTag(
  tagId: number,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("filter_by_tag", { tagId, offset, limit });
}

export async function filterByAlbum(
  albumId: number,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("filter_by_album", {
    albumId,
    offset,
    limit,
  });
}

// ============================================
// FACE DETECTION
// ============================================

export async function startFaceIndex(): Promise<void> {
  return invoke<void>("start_face_index");
}

export async function getFacesForImage(
  imageId: number
): Promise<FaceRecord[]> {
  return invoke<FaceRecord[]>("get_faces_for_image", { imageId });
}

// ============================================
// PEOPLE MANAGEMENT
// ============================================

export async function listPeople(): Promise<PersonRecord[]> {
  return invoke<PersonRecord[]>("list_people");
}

export async function createPerson(name: string): Promise<number> {
  return invoke<number>("create_person", { name });
}

export async function updatePersonName(
  personId: number,
  name: string
): Promise<void> {
  return invoke<void>("update_person_name", { personId, name });
}

export async function deletePerson(personId: number): Promise<void> {
  return invoke<void>("delete_person", { personId });
}

export async function assignFaceToPerson(
  faceId: number,
  personId: number
): Promise<void> {
  return invoke<void>("assign_face_to_person", { faceId, personId });
}

export async function unassignFaceFromPerson(
  faceId: number
): Promise<void> {
  return invoke<void>("unassign_face_from_person", { faceId });
}

export async function getFacesForPerson(
  personId: number
): Promise<FaceRecord[]> {
  return invoke<FaceRecord[]>("get_faces_for_person", { personId });
}

export async function getImagesForPerson(
  personId: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("get_images_for_person", { personId });
}

// ============================================
// TAG MANAGEMENT
// ============================================

export async function listTags(): Promise<TagRecord[]> {
  return invoke<TagRecord[]>("list_tags");
}

export async function createTag(
  name: string,
  color?: string | null
): Promise<number> {
  return invoke<number>("create_tag", { name, color });
}

export async function deleteTag(tagId: number): Promise<void> {
  return invoke<void>("delete_tag", { tagId });
}

export async function tagImage(imageId: number, tagId: number): Promise<void> {
  return invoke<void>("tag_image", { imageId, tagId });
}

export async function untagImage(
  imageId: number,
  tagId: number
): Promise<void> {
  return invoke<void>("untag_image", { imageId, tagId });
}

export async function getTagsForImage(
  imageId: number
): Promise<TagRecord[]> {
  return invoke<TagRecord[]>("get_tags_for_image", { imageId });
}

// ============================================
// ALBUM MANAGEMENT
// ============================================

export async function listAlbums(): Promise<AlbumRecord[]> {
  return invoke<AlbumRecord[]>("list_albums");
}

export async function createAlbum(
  name: string,
  description?: string | null
): Promise<number> {
  return invoke<number>("create_album", { name, description });
}

export async function deleteAlbum(albumId: number): Promise<void> {
  return invoke<void>("delete_album", { albumId });
}

export async function addImageToAlbum(
  albumId: number,
  imageId: number
): Promise<void> {
  return invoke<void>("add_image_to_album", { albumId, imageId });
}

export async function removeImageFromAlbum(
  albumId: number,
  imageId: number
): Promise<void> {
  return invoke<void>("remove_image_from_album", { albumId, imageId });
}

export async function getImagesForAlbum(
  albumId: number,
  offset: number,
  limit: number
): Promise<ImageRecord[]> {
  return invoke<ImageRecord[]>("get_images_for_album", {
    albumId,
    offset,
    limit,
  });
}

// ============================================
// AI & PROCESSING
// ============================================

export async function upscaleImage(
  imagePath: string,
  outputDir: string,
  scale: number
): Promise<string> {
  return invoke<string>("upscale_image", { imagePath, outputDir, scale });
}

// ============================================
// EXPORT
// ============================================

export async function exportXmpSidecars(
  imageIds: number[],
  outputDir: string
): Promise<number> {
  return invoke<number>("export_xmp_sidecars", { imageIds, outputDir });
}
