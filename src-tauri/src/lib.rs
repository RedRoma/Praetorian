mod db;
mod catalog;
mod image;
mod exif;
#[cfg(feature = "face-detection")]
mod face;
mod python;

use std::sync::Arc;
use std::fs;
use anyhow::Result;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State};
use sqlx::SqlitePool;
use catalog::manager::{CatalogManager, FaceRecord, PersonRecord, TagRecord, AlbumRecord, CatalogStats};

/// App-level state shared across Tauri commands.
pub struct AppState {
    pub catalog: Mutex<Option<CatalogManager>>,
}

/// Extract the SQLite pool from app state, or return an error if no catalog is open.
async fn get_pool(state: State<'_, AppState>) -> Result<SqlitePool, String> {
    let guard = state.catalog.lock().await;
    let catalog = guard.as_ref().ok_or_else(|| "No catalog open".to_string())?;
    Ok(catalog.db.pool().clone())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

/// Opens an existing .praetorian catalog file.
#[tauri::command]
async fn open_catalog(path: String, state: State<'_, AppState>) -> Result<String, String> {
    let catalog = CatalogManager::new(&path)
        .await
        .map_err(|e| e.to_string())?;

    let mut guard = state.catalog.lock().await;
    *guard = Some(catalog);
    Ok(path)
}

/// Creates a new .praetorian catalog at the given path.
#[tauri::command]
async fn create_catalog(path: String, state: State<'_, AppState>) -> Result<String, String> {
    log::info!("create_catalog called with path: {}", path);
    let catalog = CatalogManager::new(&path)
        .await
        .map_err(|e| {
            log::error!("Failed to create catalog: {}", e);
            e.to_string()
        })?;

    let mut guard = state.catalog.lock().await;
    *guard = Some(catalog);
    log::info!("Catalog created successfully at: {}", path);
    Ok(path)
}

/// Scans a directory and imports all supported images into the catalog.
#[tauri::command]
async fn import_directory(
    app_handle: AppHandle,
    dir_path: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = get_pool(state).await?;

    let batch_size = num_cpus::get() * 2;

    let progress_cb: Arc<dyn Fn(i32, i32, &str) + Send + Sync> = Arc::new(
        move |current: i32, total: i32, filename: &str| {
            let _ = app_handle.emit("import-progress", serde_json::json!({
                "current": current,
                "total": total,
                "filename": filename,
            }));
        },
    );

    let imported = CatalogManager::import_directory_from_pool(&pool, &dir_path, batch_size, Some(progress_cb))
        .await
        .map_err(|e| e.to_string())?;

    Ok(imported)
}

/// Lists images from the catalog with pagination and optional rating filter.
#[tauri::command]
async fn list_images(
    offset: i64,
    limit: i64,
    rating_filter: Option<i32>,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::list_images_from_pool(&pool, offset, limit, rating_filter)
        .await
        .map_err(|e| e.to_string())?;

    log::info!("list_images returned {} images", images.len());
    Ok(images)
}

/// Returns the total number of images in the catalog.
#[tauri::command]
async fn count_images(state: State<'_, AppState>) -> Result<i64, String> {
    let pool = get_pool(state).await?;

    let count = CatalogManager::count_images_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(count)
}

/// Lists all tracked folders in the catalog.
#[tauri::command]
async fn list_folders(
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::FolderRecord>, String> {
    let pool = {
        let guard = state.catalog.lock().await;
        let catalog = guard
            .as_ref()
            .ok_or_else(|| "No catalog open".to_string())?;
        catalog.db.pool().clone()
    };

    let folders = CatalogManager::list_folders_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(folders)
}

/// Returns the filesystem path to a thumbnail for a given image.
#[tauri::command]
async fn get_thumbnail_path(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = {
        let guard = state.catalog.lock().await;
        let catalog = guard
            .as_ref()
            .ok_or_else(|| "No catalog open".to_string())?;

        catalog.get_thumbnail_path(image_id).to_string_lossy().to_string()
    };
    Ok(path)
}

/// Returns the thumbnail image as a base64 data URL for direct browser display.
#[tauri::command]
async fn get_thumbnail_data(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = {
        let guard = state.catalog.lock().await;
        let catalog = guard
            .as_ref()
            .ok_or_else(|| "No catalog open".to_string())?;

        catalog.get_thumbnail_path(image_id)
    };

    if !path.exists() {
        return Ok(String::new());
    }

    let data = std::fs::read(&path).map_err(|e| e.to_string())?;
    let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:image/jpeg;base64,{}", base64))
}

/// Returns the filesystem path to a smart preview for a given image.
#[tauri::command]
async fn get_preview_path(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let path = {
        let guard = state.catalog.lock().await;
        let catalog = guard
            .as_ref()
            .ok_or_else(|| "No catalog open".to_string())?;

        catalog.get_preview_path(image_id).to_string_lossy().to_string()
    };
    Ok(path)
}

/// Returns the full-size image as a base64 data URL for display in the viewer.
#[tauri::command]
async fn get_image_data(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let pool = get_pool(state).await?;
    let (image, _) = CatalogManager::get_image_details_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;

    let path = std::path::Path::new(&image.file_path);
    if !path.exists() {
        return Ok(String::new());
    }

    let data = std::fs::read(path).map_err(|e| e.to_string())?;
    let ext = image.file_extension.to_lowercase();
    let mime_type = match ext.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        _ => "image/jpeg",
    };
    let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(format!("data:{};base64,{}", mime_type, base64))
}

/// Starts the background face detection index for all unindexed images.
#[tauri::command]
async fn start_face_index(state: State<'_, AppState>) -> Result<(), String> {
    let pool = {
        let guard = state.catalog.lock().await;
        let catalog = guard
            .as_ref()
            .ok_or_else(|| "No catalog open".to_string())?;
        catalog.db.pool().clone()
    };

    #[cfg(feature = "face-detection")]
    {
        let mut detector = face::detector::FaceDetector::new("retinaface.onnx");
        if let Err(e) = detector.initialize() {
            log::warn!("FaceDetector initialization failed, falling back to CPU: {}", e);
        }
        face::detector::rebuild_face_index(&pool, &detector).await.map_err(|e| e.to_string())?;
    }

    #[cfg(not(feature = "face-detection"))]
    {
        let _ = pool;
    }

    Ok(())
}

/// Upscales an image using the Python bridge.
#[tauri::command]
async fn upscale_image(
    image_path: String,
    output_dir: String,
    scale: u32,
    _state: State<'_, AppState>,
) -> Result<String, String> {
    let bridge = python::bridge::PythonBridge::with_defaults();

    let result = bridge
        .upscale_image(&image_path, &output_dir, scale)
        .await
        .map_err(|e| e.to_string())?;

    Ok(result.output_path)
}

/// Gets detailed info (including EXIF) for a single image.
#[tauri::command]
async fn get_image_details(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let pool = get_pool(state).await?;

    let (image, exif) = CatalogManager::get_image_details_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;

    let mut obj = serde_json::to_value(&image).map_err(|e| e.to_string())?;
    if let Some(exif_data) = exif {
        if let Some(obj_obj) = obj.as_object_mut() {
            obj_obj.insert("exif".to_string(), serde_json::to_value(&exif_data).unwrap());
        }
    }
    Ok(obj)
}

/// Updates the rating for an image.
#[tauri::command]
async fn update_rating(
    image_id: i64,
    rating: i32,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::update_rating_from_pool(&pool, image_id, rating)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Toggles the favorite status of an image.
#[tauri::command]
async fn toggle_favorite(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    let pool = get_pool(state).await?;

    let is_favorite = CatalogManager::toggle_favorite_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(is_favorite)
}

/// Sets the favorite status of an image explicitly.
#[tauri::command]
async fn set_favorite(
    image_id: i64,
    is_favorite: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::set_favorite_from_pool(&pool, image_id, is_favorite)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Archives or unarchives an image.
#[tauri::command]
async fn archive_image(
    image_id: i64,
    is_archived: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::archive_image_from_pool(&pool, image_id, is_archived)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deletes an image from the catalog.
#[tauri::command]
async fn delete_image(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::delete_image_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deletes multiple images from the catalog.
#[tauri::command]
async fn delete_images(
    image_ids: Vec<i64>,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = get_pool(state).await?;

    let deleted = CatalogManager::delete_images_from_pool(&pool, &image_ids)
        .await
        .map_err(|e| e.to_string())?;
    Ok(deleted)
}

/// Searches images by file name or path.
#[tauri::command]
async fn search_images(
    query: String,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::search_images_from_pool(&pool, &query, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

/// Counts search results for a query.
#[tauri::command]
async fn count_search_results(
    query: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let pool = get_pool(state).await?;

    let count = CatalogManager::count_search_results_from_pool(&pool, &query)
        .await
        .map_err(|e| e.to_string())?;
    Ok(count)
}

/// Filters images by camera model.
#[tauri::command]
async fn filter_by_camera(
    camera_model: String,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::filter_by_camera_from_pool(&pool, &camera_model, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

/// Filters images by lens model.
#[tauri::command]
async fn filter_by_lens(
    lens_model: String,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::filter_by_lens_from_pool(&pool, &lens_model, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

/// Filters images by person (face recognition).
#[tauri::command]
async fn filter_by_person(
    person_id: i64,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::filter_by_person_from_pool(&pool, person_id, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

/// Filters images by tag.
#[tauri::command]
async fn filter_by_tag(
    tag_id: i64,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::filter_by_tag_from_pool(&pool, tag_id, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

/// Filters images by album.
#[tauri::command]
async fn filter_by_album(
    album_id: i64,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::filter_by_album_from_pool(&pool, album_id, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

// ============================================
// PEOPLE MANAGEMENT
// ============================================

/// Lists all recognized people.
#[tauri::command]
async fn list_people(state: State<'_, AppState>) -> Result<Vec<PersonRecord>, String> {
    let pool = get_pool(state).await?;

    let people = CatalogManager::list_people_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(people)
}

/// Creates a new person entry.
#[tauri::command]
async fn create_person(
    name: String,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let pool = get_pool(state).await?;

    let id = CatalogManager::create_person_from_pool(&pool, &name)
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Updates a person's name.
#[tauri::command]
async fn update_person_name(
    person_id: i64,
    name: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::update_person_name_from_pool(&pool, person_id, &name)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Deletes a person entry.
#[tauri::command]
async fn delete_person(
    person_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::delete_person_from_pool(&pool, person_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Assigns a detected face to a person.
#[tauri::command]
async fn assign_face_to_person(
    face_id: i64,
    person_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::assign_face_to_person_from_pool(&pool, face_id, person_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes a face from its person assignment.
#[tauri::command]
async fn unassign_face_from_person(
    face_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::unassign_face_from_person_from_pool(&pool, face_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Gets all detected faces for a specific image.
#[tauri::command]
async fn get_faces_for_image(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<FaceRecord>, String> {
    let pool = get_pool(state).await?;

    let faces = CatalogManager::get_faces_for_image_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(faces)
}

/// Gets all faces assigned to a person.
#[tauri::command]
async fn get_faces_for_person(
    person_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<FaceRecord>, String> {
    let pool = get_pool(state).await?;

    let faces = CatalogManager::get_faces_for_person_from_pool(&pool, person_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(faces)
}

/// Gets all images for a person.
#[tauri::command]
async fn get_images_for_person(
    person_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::get_images_for_person_from_pool(&pool, person_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

// ============================================
// TAG MANAGEMENT
// ============================================

/// Lists all tags.
#[tauri::command]
async fn list_tags(state: State<'_, AppState>) -> Result<Vec<TagRecord>, String> {
    let pool = get_pool(state).await?;

    let tags = CatalogManager::list_tags_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tags)
}

/// Creates a new tag.
#[tauri::command]
async fn create_tag(
    name: String,
    color: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let pool = get_pool(state).await?;

    let id = CatalogManager::create_tag_from_pool(&pool, &name, color.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Deletes a tag.
#[tauri::command]
async fn delete_tag(
    tag_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::delete_tag_from_pool(&pool, tag_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Tags an image.
#[tauri::command]
async fn tag_image(
    image_id: i64,
    tag_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::tag_image_from_pool(&pool, image_id, tag_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes a tag from an image.
#[tauri::command]
async fn untag_image(
    image_id: i64,
    tag_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::untag_image_from_pool(&pool, image_id, tag_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Gets all tags for an image.
#[tauri::command]
async fn get_tags_for_image(
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<Vec<TagRecord>, String> {
    let pool = get_pool(state).await?;

    let tags = CatalogManager::get_tags_for_image_from_pool(&pool, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(tags)
}

// ============================================
// ALBUM MANAGEMENT
// ============================================

/// Lists all albums.
#[tauri::command]
async fn list_albums(state: State<'_, AppState>) -> Result<Vec<AlbumRecord>, String> {
    let pool = get_pool(state).await?;

    let albums = CatalogManager::list_albums_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(albums)
}

/// Creates a new album.
#[tauri::command]
async fn create_album(
    name: String,
    description: Option<String>,
    state: State<'_, AppState>,
) -> Result<i64, String> {
    let pool = get_pool(state).await?;

    let id = CatalogManager::create_album_from_pool(&pool, &name, description.as_deref())
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

/// Deletes an album.
#[tauri::command]
async fn delete_album(
    album_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::delete_album_from_pool(&pool, album_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Adds an image to an album.
#[tauri::command]
async fn add_image_to_album(
    album_id: i64,
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::add_image_to_album_from_pool(&pool, album_id, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Removes an image from an album.
#[tauri::command]
async fn remove_image_from_album(
    album_id: i64,
    image_id: i64,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let pool = get_pool(state).await?;

    CatalogManager::remove_image_from_album_from_pool(&pool, album_id, image_id)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Gets all images in an album.
#[tauri::command]
async fn get_images_for_album(
    album_id: i64,
    offset: i64,
    limit: i64,
    state: State<'_, AppState>,
) -> Result<Vec<catalog::manager::ImageRecord>, String> {
    let pool = get_pool(state).await?;

    let images = CatalogManager::get_images_for_album_from_pool(&pool, album_id, offset, limit)
        .await
        .map_err(|e| e.to_string())?;
    Ok(images)
}

// ============================================
// CATALOG STATS
// ============================================

/// Gets overall catalog statistics.
#[tauri::command]
async fn get_catalog_stats(state: State<'_, AppState>) -> Result<CatalogStats, String> {
    let pool = get_pool(state).await?;

    let stats = CatalogManager::get_catalog_stats_from_pool(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(stats)
}

// ============================================
// XMP EXPORT
// ============================================

/// Exports metadata as XMP sidecar files.
#[tauri::command]
async fn export_xmp_sidecars(
    image_ids: Vec<i64>,
    output_dir: String,
    state: State<'_, AppState>,
) -> Result<usize, String> {
    let pool = get_pool(state).await?;

    let exported = CatalogManager::export_xmp_sidecars_from_pool(&pool, &image_ids, &output_dir)
        .await
        .map_err(|e| e.to_string())?;
    Ok(exported)
}

/// Re-parses EXIF metadata for all images in the catalog.
#[tauri::command]
async fn rebuild_metadata(state: State<'_, AppState>) -> Result<usize, String> {
    let guard = state.catalog.lock().await;
    let catalog = guard.as_ref().ok_or_else(|| "No catalog open".to_string())?;

    let updated = catalog.rebuild_metadata().await.map_err(|e| e.to_string())?;
    Ok(updated)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            app.manage(AppState {
                catalog: Mutex::new(None),
            });

            // Bridge log:: crate to tracing so our log::info! calls are captured.
            tracing_log::LogTracer::init().ok();

            // Set up file logging to the app's data directory.
            let app_data_dir = app.path().app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from(".").to_path_buf());
            fs::create_dir_all(&app_data_dir).ok();
            let log_file = app_data_dir.join("praetorian.log");

            let file = fs::File::create(&log_file).ok();
            if let Some(f) = file {
                let subscriber = tracing_subscriber::fmt()
                    .with_env_filter(
                        tracing_subscriber::EnvFilter::from_default_env()
                            .add_directive("praetorian=debug".parse().unwrap())
                            .add_directive("sqlx=warn".parse().unwrap()),
                    )
                    .with_writer(f)
                    .finish();
                tracing_subscriber::fmt()
                    .with_env_filter(
                        tracing_subscriber::EnvFilter::from_default_env()
                            .add_directive("praetorian=debug".parse().unwrap())
                            .add_directive("sqlx=warn".parse().unwrap()),
                    )
                    .with_writer(std::io::stdout)
                    .with_ansi(true)
                    .finish();

                let _ = tracing::subscriber::set_global_default(subscriber);
            } else {
                tracing_subscriber::fmt()
                    .with_env_filter(
                        tracing_subscriber::EnvFilter::from_default_env()
                            .add_directive("praetorian=debug".parse().unwrap()),
                    )
                    .init();
            }

            log::info!("Log file: {}", log_file.display());

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            open_catalog,
            create_catalog,
            import_directory,
            list_images,
            count_images,
            list_folders,
            get_thumbnail_path,
            get_thumbnail_data,
            get_image_data,
            get_preview_path,
            start_face_index,
            upscale_image,
            get_image_details,
            update_rating,
            toggle_favorite,
            set_favorite,
            archive_image,
            delete_image,
            delete_images,
            search_images,
            count_search_results,
            filter_by_camera,
            filter_by_lens,
            filter_by_person,
            filter_by_tag,
            filter_by_album,
            list_people,
            create_person,
            update_person_name,
            delete_person,
            assign_face_to_person,
            unassign_face_from_person,
            get_faces_for_image,
            get_faces_for_person,
            get_images_for_person,
            list_tags,
            create_tag,
            delete_tag,
            tag_image,
            untag_image,
            get_tags_for_image,
            list_albums,
            create_album,
            delete_album,
            add_image_to_album,
            remove_image_from_album,
            get_images_for_album,
            get_catalog_stats,
            export_xmp_sidecars,
            rebuild_metadata,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
