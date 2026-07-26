use std::path::{Path, PathBuf};
use std::fs;
use std::sync::Arc;

use sqlx::{SqlitePool, FromRow, Row};
use sha2::{Sha256, Digest};
use walkdir::WalkDir;
use anyhow::{Context, Result};
use serde::Serialize;

use crate::db::Database;
use crate::exif::parser::ExifParser;
use crate::image::pipeline::ImagePipeline;

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "tiff", "tif", "webp", "bmp",
    "arw", "cr3", "cr2", "nef", "orf", "sr2", "dng", "raf",
];

#[derive(Debug, FromRow, serde::Serialize)]
pub struct ImageRecord {
    pub id: i64,
    pub folder_id: Option<i64>,
    pub file_path: String,
    pub file_name: String,
    pub file_extension: String,
    pub file_size_bytes: i64,
    pub width: Option<i32>,
    pub height: Option<i32>,
    pub date_taken: Option<String>,
    pub date_imported: String,
    pub has_thumbnail: bool,
    pub has_preview: bool,
    pub rating: i32,
    pub is_favorite: bool,
    pub faces_indexed: bool,
    pub is_missing: bool,
}

#[derive(Debug, FromRow, serde::Serialize)]
pub struct FolderRecord {
    pub id: i64,
    pub path: String,
    pub name: String,
    pub parent_id: Option<i64>,
    pub date_added: String,
    pub is_watched: bool,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct ExifRecord {
    pub image_id: i64,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub lens_model: Option<String>,
    pub iso: Option<i32>,
    pub aperture_f_number: Option<f64>,
    pub shutter_speed_num: Option<i32>,
    pub shutter_speed_den: Option<i32>,
    pub focal_length_mm: Option<f64>,
    pub gps_latitude: Option<f64>,
    pub gps_longitude: Option<f64>,
    pub gps_altitude: Option<f64>,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct PersonRecord {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub face_count: i64,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct FaceRecord {
    pub id: i64,
    pub image_id: i64,
    pub person_id: Option<i64>,
    pub bbox_x: f64,
    pub bbox_y: f64,
    pub bbox_width: f64,
    pub bbox_height: f64,
    pub confidence: f64,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct TagRecord {
    pub id: i64,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct AlbumRecord {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub created_at: String,
}

#[derive(Debug, FromRow, Clone, Serialize)]
pub struct ImageWithTag {
    pub id: i64,
    pub file_path: String,
    pub file_name: String,
    pub tag_name: String,
}

#[derive(Debug, Serialize)]
pub struct CatalogStats {
    pub total_images: i64,
    pub total_faces: i64,
    pub total_people: i64,
    pub total_folders: i64,
    pub total_tags: i64,
    pub unindexed_faces: i64,
    pub missing_files: i64,
}

pub struct CatalogManager {
    pub db: Database,
    pub cache_dir: PathBuf,
    pub exif_parser: ExifParser,
    pub image_pipeline: ImagePipeline,
}

impl CatalogManager {
    pub async fn new(catalog_path: &str) -> Result<Self> {
        let db = Database::open_or_create(catalog_path).await
            .context("Failed to open or create catalog database")?;

        let catalog_dir = Path::new(catalog_path)
            .parent()
            .context("Catalog path has no parent directory")?
            .to_path_buf();

        let cache_dir = catalog_dir.join("cache");
        fs::create_dir_all(&cache_dir).context("Failed to create cache directory")?;

        let exif_parser = ExifParser::new();
        let pool = db.pool();
        let mut image_pipeline = ImagePipeline::new(cache_dir.clone());

        // Start the background worker with a cloned pool
        image_pipeline.start(pool.clone());

        Ok(Self {
            db,
            cache_dir,
            exif_parser,
            image_pipeline,
        })
    }

    /// Scans a directory and imports all supported image files into the catalog.
    /// Returns the count of newly imported images.
    pub async fn import_directory(&self, dir_path: &str) -> Result<usize> {
        let pool = self.db.pool();
        let dir = Path::new(dir_path);

        if !dir.exists() {
            anyhow::bail!("Directory does not exist: {}", dir_path);
        }

        // Insert or get folder record
        let folder_id = self.ensure_folder(dir_path, pool).await?;

        let mut imported = 0usize;
        let mut queue = vec![dir.to_path_buf()];

        while let Some(current_dir) = queue.pop() {
            for entry in WalkDir::new(&current_dir)
                .max_depth(1)
                .into_iter()
                .filter_map(|e| e.ok()) {

                if entry.file_type().is_dir() {
                    if entry.file_name() != ".praetorian" {
                        queue.push(entry.path().to_path_buf());
                    }
                    continue;
                }

                let ext = entry
                    .path()
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .unwrap_or_default();

                if !SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
                    continue;
                }

                let file_path = entry.path().to_string_lossy().to_string();

                // Skip if already cataloged
                let exists: bool = sqlx::query_scalar(
                    r#"SELECT EXISTS(
                        SELECT 1 FROM images WHERE file_path = ?
                    )
                    "#,
                )
                .bind(&file_path)
                .fetch_one(pool)
                .await?;

                if exists {
                    continue;
                }

                match self.import_single_image(&file_path, folder_id, pool).await {
                    Ok(_) => imported += 1,
                    Err(e) => {
                        log::warn!("Failed to import {}: {}", file_path, e);
                    }
                }
            }
        }

        Ok(imported)
    }

    /// Imports a single image file: reads EXIF, creates DB record, queues thumbnail generation.
    async fn import_single_image(
        &self,
        file_path: &str,
        folder_id: i64,
        pool: &SqlitePool,
    ) -> Result<i64> {
        let metadata = fs::metadata(file_path)
            .context(format!("Cannot access file: {}", file_path))?;

        let file_name = Path::new(file_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let file_extension = Path::new(file_path)
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
            .to_lowercase();

        let file_hash = Self::compute_file_hash(file_path)?;

        // Parse EXIF metadata
        let exif = self.exif_parser
            .parse(file_path)
            .unwrap_or_default();

        // Use filesystem modification time as fallback for date_taken
        let file_date = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        let date_taken = exif.date_time_original.clone().or_else(|| {
            file_date.map(|secs| {
                use chrono::{DateTime, Utc};
                DateTime::<Utc>::from_timestamp(secs as i64, 0)
                    .map(|dt| dt.format("%Y-%m-%d %H:%M:%S").to_string())
            }).flatten()
        });

        // Insert image record
        let result = sqlx::query(
            r#"
            INSERT INTO images (
                folder_id, 
                file_path, 
                file_name, 
                file_extension,
                file_size_bytes,
                width, 
                height, 
                date_taken, 
                file_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(folder_id)
        .bind(file_path)
        .bind(file_name)
        .bind(file_extension)
        .bind(metadata.len() as i64)
        .bind(exif.width.map(|w| w as i32))
        .bind(exif.height.map(|h| h as i32))
        .bind(date_taken.as_deref())
        .bind(file_hash)
        .execute(pool)
        .await?;

        let image_id = result.last_insert_rowid();

        // Insert EXIF data
        sqlx::query(
            r#"
            INSERT INTO exif_data (
                image_id, 
                camera_make, 
                camera_model, 
                lens_model,
                iso, 
                aperture_f_number,
                shutter_speed_num, 
                shutter_speed_den,
                focal_length_mm, 
                gps_latitude, 
                gps_longitude, 
                gps_altitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(image_id)
        .bind(exif.camera_make.as_deref())
        .bind(exif.camera_model.as_deref())
        .bind(exif.lens_model.as_deref())
        .bind(exif.iso.map(|i| i as i32))
        .bind(exif.aperture)
        .bind(exif.shutter_num.map(|n| n as i32))
        .bind(exif.shutter_den.map(|d| d as i32))
        .bind(exif.focal_length)
        .bind(exif.gps_latitude)
        .bind(exif.gps_longitude)
        .bind(exif.gps_altitude)
        .execute(pool)
        .await?;

        // Queue thumbnail generation
        self.queue_thumbnail(image_id, file_path, pool).await?;

        Ok(image_id)
    }

    async fn ensure_folder(&self, path: &str, pool: &SqlitePool) -> Result<i64> {
        let folder_name = Path::new(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let existing: Option<i64> = sqlx::query_scalar(
            "SELECT id FROM folders WHERE path = ?",
        )
        .bind(path)
        .fetch_optional(pool)
        .await?;

        if let Some(id) = existing {
            return Ok(id);
        }

        let result = sqlx::query(
            "INSERT INTO folders (path, name) VALUES (?, ?)",
        )
        .bind(path)
        .bind(folder_name)
        .execute(pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    async fn queue_thumbnail(
        &self,
        image_id: i64,
        _file_path: &str,
        pool: &SqlitePool,
    ) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO processing_queue (
              image_id, 
              task_type, 
              priority
            )
            VALUES (?, 'thumbnail', 10)
            "#,
        )
        .bind(image_id)
        .execute(pool)
        .await?;

        // Also queue smart preview
        sqlx::query(
            r#"
            INSERT INTO processing_queue (
                image_id, 
                task_type, 
                priority
            )
            VALUES (?, 'preview', 5)
            "#,
        )
        .bind(image_id)
        .execute(pool)
        .await?;

        Ok(())
    }

    fn compute_file_hash(path: &str) -> Result<String> {
        let contents = fs::read(path)?;
        let mut hasher = Sha256::new();
        hasher.update(&contents);
        Ok(format!("{:x}", hasher.finalize()))
    }

    /// Fetches paginated images with optional filters.
    pub async fn list_images(
        &self,
        offset: i64,
        limit: i64,
        rating_filter: Option<i32>,
    ) -> Result<Vec<ImageRecord>> {
        let pool = self.db.pool();

        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT id, 
                   folder_id, 
                   file_path, 
                   file_name, 
                   file_extension,
                   file_size_bytes, 
                   width, 
                   height, 
                   date_taken, 
                   date_imported,
                   has_thumbnail, 
                   has_preview, 
                   rating, 
                   is_favorite,
                   faces_indexed, 
                   is_missing
            FROM images
            WHERE is_archived = 0
              AND (? IS NULL OR rating = ?)
            ORDER BY COALESCE(date_taken, date_imported) DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(rating_filter)
        .bind(rating_filter)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    /// Gets the total image count (for pagination).
    pub async fn count_images(&self) -> Result<i64> {
        let pool = self.db.pool();
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) 
            FROM images 
            WHERE is_archived = 0
            "#,
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    /// Gets the cache directory path for a given image ID.
    pub fn get_thumbnail_path(&self, image_id: i64) -> PathBuf {
        self.cache_dir.join(format!("thumb_{}.jpg", image_id))
    }

    pub fn get_preview_path(&self, image_id: i64) -> PathBuf {
        self.cache_dir.join(format!("preview_{}.jpg", image_id))
    }

    /// Static method to import directory using a cloned pool (avoids holding mutex across await).
    ///
    /// Three-phase approach:
    /// 1. Scan & collect all candidate image paths from the directory tree.
    /// 2. Batch SELECT EXISTS to find which paths are already cataloged.
    /// 3. Process uncataloged images in configurable batches with parallel metadata extraction.
    ///
    /// `batch_size` controls how many images are processed concurrently per batch.
    /// `progress_cb` is called for each image after it's been inserted (current, total, filename).
    pub async fn import_directory_from_pool(
        pool: &SqlitePool,
        dir_path: &str,
        batch_size: usize,
        progress_cb: Option<Arc<dyn Fn(i32, i32, &str) + Send + Sync>>,
    ) -> Result<usize> {
        let dir = Path::new(dir_path);

        if !dir.exists() {
            log::info!(
                "Directory does not exist: {}",
                dir_path
            );
            anyhow::bail!("Directory does not exist: {}", dir_path);
        }

        let import_start = std::time::Instant::now();
        log::info!(
            "Importing directory: {} (batch_size={})",
            dir_path,
            batch_size
        );

        // --- Phase 1: Scan & collect candidate image paths ---
        // Run on blocking pool so we don't starve tokio's async workers.
        let scan_start = std::time::Instant::now();
        let dir_clone = dir.to_path_buf();
        let (candidates, queued_subdirs) = tokio::task::spawn_blocking(move || {
            Self::scan_directory(&dir_clone)
        })
        .await
        .map_err(|e| anyhow::anyhow!("scan_directory join error: {}", e))?;
        let scan_elapsed = scan_start.elapsed();
        log::info!(
            "Scan complete: {} candidates, {} subdirectories (took {:.2}s)",
            candidates.len(),
            queued_subdirs,
            scan_elapsed.as_secs_f64()
        );

        if candidates.is_empty() {
            return Ok(0);
        }

        // --- Phase 2: Batch dedup check ---
        let dedup_start = std::time::Instant::now();
        log::info!("Starting dedup check...");
        let uncataloged = Self::batch_dedup(pool, &candidates).await?;
        let dedup_elapsed = dedup_start.elapsed();
        log::info!(
            "Dedup complete: {} new images out of {} candidates (took {:.2}s)",
            uncataloged.len(),
            candidates.len(),
            dedup_elapsed.as_secs_f64()
        );

        if uncataloged.is_empty() {
            return Ok(0);
        }

        // --- Phase 3: Parallel metadata extraction & insert ---
        let import_phase_start = std::time::Instant::now();
        log::info!("Starting import phase...");
        let folder_id = Self::ensure_folder_static(dir_path, pool).await?;
        let mut imported = 0usize;
        let total = uncataloged.len() as i32;

        // For each batch.
        for (batch_num, batch) in uncataloged.chunks(batch_size).enumerate() {
            let batch_start = std::time::Instant::now();
            log::info!(
                "Processing batch {} ({} images)",
                batch_num + 1,
                batch.len()
            );

            let handles: Vec<_> = batch.iter().map(|file_path| {
                let filepath = file_path.clone();
                let sql_pool = pool.clone();
                tokio::spawn(async move { 
                    Self::import_single_image_static(
                        &filepath,
                        folder_id,
                        &sql_pool
                    ).await 
                })
            }).collect();

            for (i, handle) in handles.into_iter().enumerate() {
                let task_start = std::time::Instant::now();
                match handle.await {
                    Ok(Ok(_)) => {
                        imported += 1;
                        let current = imported as i32;
                        let task_elapsed = task_start.elapsed();
                        if let Some(cb) = &progress_cb {
                            let filename = batch[i].split('/')
                                                   .last()
                                                   .unwrap_or(
                                                       batch[i].split('\\')
                                                               .last()
                                                               .unwrap_or(&batch[i])
                                                   ).to_string();
                            log::info!(
                                "  [{}] Import done ({:.2}s)",
                                filename,
                                task_elapsed.as_secs_f64()
                            );
                            cb(current, total, &filename);
                        }
                    }
                    Ok(Err(e)) => {
                        log::warn!("Failed to import {}: {}", batch[i], e);
                    }
                    Err(e) => {
                        log::error!("Task join error for {}: {}", batch[i], e);
                    }
                }
            }
            let batch_elapsed = batch_start.elapsed();
            log::info!(
                "Batch {} complete (took {:.2}s)",
                batch_num + 1,
                batch_elapsed.as_secs_f64()
            );
        }

        let import_phase_elapsed = import_phase_start.elapsed();
        let total_elapsed = import_start.elapsed();
        log::info!(
            "Import complete: {} images imported, {} subdirectories scanned (import phase: {:.2}s, total: {:.2}s)",
            imported,
            queued_subdirs,
            import_phase_elapsed.as_secs_f64(),
            total_elapsed.as_secs_f64()
        );

        Ok(imported)
    }

    /// Phase 1 helper: walk directory tree and collect candidate image file paths.
    fn scan_directory(root: &Path) -> (Vec<String>, usize) {
        let mut candidates = Vec::new();
        let mut queued_subdirs = 0usize;
        let mut queue = vec![root.to_path_buf()];

        while let Some(current_dir) = queue.pop() {
            log::info!("Scanning directory: {}", current_dir.display());
            for entry in WalkDir::new(&current_dir)
                .min_depth(1)
                .max_depth(1)
                .follow_links(false)
                .into_iter()
                .filter_map(|e| e.ok()) {

                if entry.file_type().is_dir() {
                    if entry.file_name() != ".praetorian" {
                        queue.push(entry.path().to_path_buf());
                        queued_subdirs += 1;
                    }
                    continue;
                }

                let ext = entry
                    .path()
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|s| s.to_lowercase())
                    .unwrap_or_default();

                if SUPPORTED_EXTENSIONS.contains(&ext.as_str()) {
                    candidates.push(entry.path().to_string_lossy().to_string());
                }
            }
        }

        (candidates, queued_subdirs)
    }

    /// Phase 2 helper: batch-check which file paths already exist in the catalog.
    /// Fetches all existing paths from DB, then filters candidates in memory.
    async fn batch_dedup(pool: &SqlitePool, candidates: &[String]) -> Result<Vec<String>> {
        if candidates.is_empty() {
            return Ok(Vec::new());
        }

        // Fetch all existing file paths from the DB in one query
        let existing_rows: Vec<String> = sqlx::query_scalar(
            "SELECT file_path FROM images"
        )
        .fetch_all(pool)
        .await?;

        let existing_set: std::collections::HashSet<&str> =
            existing_rows.iter().map(|s| s.as_str()).collect();

        let uncataloged: Vec<String> = candidates
            .iter()
            .filter(|p| !existing_set.contains(p.as_str()))
            .cloned()
            .collect();

        Ok(uncataloged)
    }

    async fn import_single_image_static(
        file_path: &str,
        folder_id: i64,
        pool: &SqlitePool,
    ) -> Result<i64> {
        let file_start = std::time::Instant::now();
        let file_name_str = Path::new(file_path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        log::info!("[{}] Starting import", file_name_str);

        let metadata = fs::metadata(file_path)
            .context(format!("Cannot access file: {}", file_path))?;

        let file_name = file_name_str.clone();

        let file_extension = Path::new(file_path)
            .extension()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
            .to_lowercase();

        // Run blocking file I/O (full-file read for hash + EXIF) on the blocking pool
        // to avoid starving tokio's async worker threads.
        let fp = file_path.to_string();
        let hash_start = std::time::Instant::now();
        log::info!("[{}] Starting SHA-256 hash...", file_name);
        let (file_hash, exif) = tokio::task::spawn_blocking(move || {
            let hash = Self::compute_file_hash(&fp).unwrap_or_default();
            let exif_start = std::time::Instant::now();
            let exif_data = ExifParser::new().parse(&fp).unwrap_or_default();
            let exif_elapsed = exif_start.elapsed();
            log::info!("[{}] EXIF parsed ({:.2}s)", fp.split('/').last().unwrap_or(&fp), exif_elapsed.as_secs_f64());
            (hash, exif_data)
        })
        .await
        .map_err(|e| anyhow::anyhow!("spawn_blocking failed: {}", e))?;
        let hash_elapsed = hash_start.elapsed();
        log::info!("[{}] SHA-256 + EXIF done ({:.2}s total)", file_name, hash_elapsed.as_secs_f64());

        let db_start = std::time::Instant::now();
        log::info!("[{}] Inserting into DB...", file_name);

        let result = sqlx::query(
            r#"
            INSERT INTO images (
                folder_id,
                file_path,
                file_name,
                file_extension,
                file_size_bytes,
                width,
                height,
                date_taken,
                file_hash
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(folder_id)
        .bind(file_path)
        .bind(&file_name)
        .bind(file_extension)
        .bind(metadata.len() as i64)
        .bind(exif.width.map(|w| w as i32))
        .bind(exif.height.map(|h| h as i32))
        .bind(exif.date_time_original.as_deref())
        .bind(file_hash)
        .execute(pool)
        .await?;

        let image_id = result.last_insert_rowid();

        sqlx::query(
            r#"
            INSERT INTO exif_data (
                image_id,
                camera_make,
                camera_model,
                lens_model,
                iso,
                aperture_f_number,
                shutter_speed_num,
                shutter_speed_den,
                focal_length_mm,
                gps_latitude,
                gps_longitude,
                gps_altitude
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(image_id)
        .bind(exif.camera_make.as_deref())
        .bind(exif.camera_model.as_deref())
        .bind(exif.lens_model.as_deref())
        .bind(exif.iso.map(|i| i as i32))
        .bind(exif.aperture)
        .bind(exif.shutter_num.map(|n| n as i32))
        .bind(exif.shutter_den.map(|d| d as i32))
        .bind(exif.focal_length)
        .bind(exif.gps_latitude)
        .bind(exif.gps_longitude)
        .bind(exif.gps_altitude)
        .execute(pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO processing_queue (
                image_id, 
                task_type, 
                priority
            )
            VALUES (?, 'thumbnail', 10)
            "#,
        )
        .bind(image_id)
        .execute(pool)
        .await?;

        sqlx::query(
            r#"
            INSERT INTO processing_queue (
                image_id,
                task_type,
                priority
            )
            VALUES (?, 'preview', 5)
            "#,
        )
        .bind(image_id)
        .execute(pool)
        .await?;

        let db_elapsed = db_start.elapsed();
        let file_total = file_start.elapsed();
        log::info!("[{}] DB inserts done ({:.2}s), total: {:.2}s", file_name, db_elapsed.as_secs_f64(), file_total.as_secs_f64());

        Ok(image_id)
    }

    async fn ensure_folder_static(path: &str, pool: &SqlitePool) -> Result<i64> {
        let folder_name = Path::new(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        let existing: Option<i64> = sqlx::query_scalar(
            r#"
            SELECT id 
            FROM folders 
            WHERE path = ?
            "#,
        )
        .bind(path)
        .fetch_optional(pool)
        .await?;

        if let Some(id) = existing {
            return Ok(id);
        }

        let result = sqlx::query(
            r#"
            INSERT INTO folders (
                path,
                name
            ) 
            VALUES (?, ?)
            "#,
        )
        .bind(path)
        .bind(folder_name)
        .execute(pool)
        .await?;

        Ok(result.last_insert_rowid())
    }

    /// Static method to list images using a cloned pool.
    pub async fn list_images_from_pool(
        pool: &SqlitePool,
        offset: i64,
        limit: i64,
        rating_filter: Option<i32>,
    ) -> Result<Vec<ImageRecord>> {
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT id,
                   folder_id,
                   file_path,
                   file_name,
                   file_extension,
                   file_size_bytes,
                   width,
                   height,
                   date_taken,
                   date_imported,
                   has_thumbnail,
                   has_preview,
                   rating,
                   is_favorite,
                   faces_indexed,
                   is_missing
            FROM images
            WHERE is_archived = 0
              AND (? IS NULL OR rating = ?)
            ORDER BY COALESCE(date_taken, date_imported) DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(rating_filter)
        .bind(rating_filter)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    /// Static method to count images using a cloned pool.
    pub async fn count_images_from_pool(pool: &SqlitePool) -> Result<i64> {
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) 
            FROM images 
            WHERE is_archived = 0
            "#,
        )
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    /// Static method to list folders using a cloned pool.
    pub async fn list_folders_from_pool(pool: &SqlitePool) -> Result<Vec<FolderRecord>> {
        let folders = sqlx::query_as::<_, FolderRecord>(
            r#"
            SELECT id, 
                   path, 
                   name, 
                   parent_id, 
                   date_added, 
                   is_watched 
            FROM folders 
            ORDER BY date_added DESC
            "#,
        )
        .fetch_all(pool)
        .await?;

        Ok(folders)
    }

    // ============================================
    // IMAGE DETAILS & EXIF
    // ============================================

    pub async fn get_image_details_from_pool(pool: &SqlitePool, image_id: i64) -> Result<(ImageRecord, Option<ExifRecord>)> {
        let image: ImageRecord = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT id, 
                   folder_id, 
                   file_path, 
                   file_name, 
                   file_extension,
                   file_size_bytes,
                   width, 
                   height, 
                   date_taken, 
                   date_imported,
                   has_thumbnail, 
                   has_preview, 
                   rating, 
                   is_favorite,
                   faces_indexed,
                   is_missing
            FROM images WHERE id = ?
            "#,
        )
        .bind(image_id)
        .fetch_one(pool)
        .await?;

        let exif: Option<ExifRecord> = sqlx::query_as::<_, ExifRecord>(
            r#"
            SELECT image_id, 
                   camera_make, 
                   camera_model, 
                   lens_model,
                   iso, 
                   aperture_f_number, 
                   shutter_speed_num, 
                   shutter_speed_den,
                   focal_length_mm, 
                   gps_latitude, 
                   gps_longitude, 
                   gps_altitude
            FROM exif_data 
            WHERE image_id = ?
            "#,
        )
        .bind(image_id)
        .fetch_optional(pool)
        .await?;

        Ok((image, exif))
    }

    // ============================================
    // RATING & FAVORITE
    // ============================================

    pub async fn update_rating_from_pool(pool: &SqlitePool, image_id: i64, rating: i32) -> Result<()> {
        sqlx::query(r#"
            UPDATE images 
            SET rating = ? 
            WHERE id = ?
            "#)
            .bind(rating)
            .bind(image_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn toggle_favorite_from_pool(pool: &SqlitePool, image_id: i64) -> Result<bool> {
        let row = sqlx::query(r#"
            UPDATE images 
            SET is_favorite = NOT is_favorite 
            WHERE id = ? 
            RETURNING is_favorite
            "#,
        )
        .bind(image_id)
        .fetch_one(pool)
        .await?;
        let is_favorite: bool = row.try_get("is_favorite")?;
        Ok(is_favorite)
    }

    pub async fn set_favorite_from_pool(pool: &SqlitePool, image_id: i64, is_favorite: bool) -> Result<()> {
        sqlx::query(r#"
            UPDATE images 
            SET is_favorite = ? 
            WHERE id = ?
            "#)
            .bind(is_favorite)
            .bind(image_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    // ============================================
    // ARCHIVE & DELETE
    // ============================================

    pub async fn archive_image_from_pool(pool: &SqlitePool, image_id: i64, is_archived: bool) -> Result<()> {
        sqlx::query(r#"
            UPDATE images 
            SET is_archived = ? 
            WHERE id = ?
            "#)
            .bind(is_archived)
            .bind(image_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete_image_from_pool(pool: &SqlitePool, image_id: i64) -> Result<()> {
        sqlx::query(r#"
            DELETE FROM images 
            WHERE id = ?
            "#)
            .bind(image_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete_images_from_pool(pool: &SqlitePool, image_ids: &[i64]) -> Result<usize> {
        let mut total = 0usize;
        for id in image_ids {
            let _ = sqlx::query(r#"
                DELETE FROM images 
                WHERE id = ?
                "#)
                .bind(id)
                .execute(pool)
                .await;
            total += 1;
        }
        Ok(total)
    }

    // ============================================
    // SEARCH & FILTER
    // ============================================

    pub async fn search_images_from_pool(
        pool: &SqlitePool,
        query: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let search = format!("%{}%", query);
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT id, 
                   folder_id, 
                   file_path, 
                   file_name, 
                   file_extension,
                   file_size_bytes, 
                   width, 
                   height, 
                   date_taken, 
                   date_imported,
                   has_thumbnail, 
                   has_preview, 
                   rating, 
                   is_favorite,
                   faces_indexed,
                   is_missing
            FROM images
            WHERE is_archived = 0
              AND (
                file_name LIKE ?
                OR file_path LIKE ?
              )
            ORDER BY COALESCE(date_taken, date_imported) ASC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(&search)
        .bind(&search)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn filter_by_camera_from_pool(
        pool: &SqlitePool,
        camera_model: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let search = format!("%{}%", camera_model);
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT i.id,
                   i.folder_id,
                   i.file_path,
                   i.file_name,
                   i.file_extension,
                   i.file_size_bytes,
                   i.width,
                   i.height,
                   i.date_taken,
                   i.date_imported
                   i.has_thumbnail,
                   i.has_preview,
                   i.rating,
                   i.is_favorite,
                   i.faces_indexed,
                   i.is_missing
            FROM images i
            JOIN exif_data e 
                ON e.image_id = i.id
            WHERE i.is_archived = 0
              AND e.camera_model LIKE ?
            ORDER BY i.date_taken DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(&search)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn filter_by_lens_from_pool(
        pool: &SqlitePool,
        lens_model: &str,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let search = format!("%{}%", lens_model);
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT i.id,
                   i.folder_id,
                   i.file_path,
                   i.file_name,
                   i.file_extension,
                   i.file_size_bytes,
                   i.width,
                   i.height,
                   i.date_taken,
                   i.date_imported,
                   i.has_thumbnail,
                   i.has_preview,
                   i.rating,
                   i.is_favorite,
                   i.faces_indexed,
                   i.is_missing
            FROM images i
            JOIN exif_data e 
                ON e.image_id = i.id
            WHERE i.is_archived = 0
              AND e.lens_model LIKE ?
            ORDER BY i.date_taken DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(&search)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn filter_by_person_from_pool(
        pool: &SqlitePool,
        person_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT DISTINCT 
                i.id,
                i.folder_id,
                i.file_path,
                i.file_name,
                i.file_extension,
                i.file_size_bytes,
                i.width,
                i.height,
                i.date_taken,
                i.date_imported,
                i.has_thumbnail,
                i.has_preview,
                i.rating,
                i.is_favorite,
                i.faces_indexed, 
                i.is_missing
            FROM images i
            JOIN faces f 
                ON f.image_id = i.id
            WHERE i.is_archived = 0
              AND f.person_id = ?
            ORDER BY i.date_taken DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(person_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn filter_by_tag_from_pool(
        pool: &SqlitePool,
        tag_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT DISTINCT
                i.id,
                i.folder_id,
                i.file_path,
                i.file_name,
                i.file_extension,
                i.file_size_bytes,
                i.width,
                i.height,
                i.date_taken,
                i.date_imported,
                i.has_thumbnail,
                i.has_preview,
                i.rating,
                i.is_favorite,
                i.faces_indexed,
                i.is_missing
            FROM images i
            JOIN image_tags it 
                ON it.image_id = i.id
            WHERE i.is_archived = 0
              AND it.tag_id = ?
            ORDER BY i.date_taken DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(tag_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn filter_by_album_from_pool(
        pool: &SqlitePool,
        album_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT DISTINCT 
                i.id,
                i.folder_id,
                i.file_path,
                i.file_name,
                i.file_extension,
                i.file_size_bytes,
                i.width,
                i.height,
                i.date_taken,
                i.date_imported,
                i.has_thumbnail,
                i.has_preview,
                i.rating,
                i.is_favorite,
                i.faces_indexed,
                i.is_missing
            FROM images i
            JOIN album_images ai 
                ON ai.image_id = i.id
            WHERE i.is_archived = 0
              AND ai.album_id = ?
            ORDER BY i.date_taken DESC
            LIMIT ? OFFSET ?
            "#,
        )
        .bind(album_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(pool)
        .await?;

        Ok(images)
    }

    pub async fn count_search_results_from_pool(
        pool: &SqlitePool,
        query: &str,
    ) -> Result<i64> {
        let search = format!("%{}%", query);
        let count: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) 
            FROM images
            WHERE is_archived = 0
              AND (file_name LIKE ? OR file_path LIKE ?)
            "#,
        )
        .bind(&search)
        .bind(&search)
        .fetch_one(pool)
        .await?;
        Ok(count)
    }

    // ============================================
    // PEOPLE MANAGEMENT
    // ============================================

    pub async fn list_people_from_pool(pool: &SqlitePool) -> Result<Vec<PersonRecord>> {
        let people = sqlx::query_as::<_, PersonRecord>(
            r#"
            SELECT p.id, 
                   p.name, 
                   p.created_at, 
                   p.updated_at,
                   COUNT(f.id) AS face_count
            FROM people p
            LEFT JOIN faces f 
                ON f.person_id = p.id
            GROUP BY p.id
            ORDER BY p.name ASC
            "#,
        )
        .fetch_all(pool)
        .await?;
        Ok(people)
    }

    pub async fn create_person_from_pool(pool: &SqlitePool, name: &str) -> Result<i64> {
        let result = sqlx::query("INSERT INTO people (name) VALUES (?)")
            .bind(name)
            .execute(pool)
            .await?;
        Ok(result.last_insert_rowid())
    }

    pub async fn update_person_name_from_pool(pool: &SqlitePool, person_id: i64, name: &str) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE people 
            SET name = ?, 
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') 
            WHERE id = ?
            "#
        )
            .bind(name)
            .bind(person_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn delete_person_from_pool(pool: &SqlitePool, person_id: i64) -> Result<()> {
        sqlx::query(
            r#"
            DELETE 
            FROM people 
            WHERE id = ?
            "#
        )
            .bind(person_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn assign_face_to_person_from_pool(
        pool: &SqlitePool,
        face_id: i64,
        person_id: i64,
    ) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE faces 
            SET person_id = ? 
            WHERE id = ?
            "#
        )
            .bind(person_id)
            .bind(face_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn unassign_face_from_person_from_pool(pool: &SqlitePool, face_id: i64) -> Result<()> {
        sqlx::query(
            r#"
            UPDATE faces 
            SET person_id = NULL 
            WHERE id = ?
            "#
        )
            .bind(face_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn get_faces_for_image_from_pool(pool: &SqlitePool, image_id: i64) -> Result<Vec<FaceRecord>> {
        let faces = sqlx::query_as::<_, FaceRecord>(
            r#"
            SELECT id,
                   image_id,
                   person_id,
                   bbox_x,
                   bbox_y,
                   bbox_width,
                   bbox_height,
                   confidence
            FROM faces 
            WHERE image_id = ?
            "#,
        )
        .bind(image_id)
        .fetch_all(pool)
        .await?;
        Ok(faces)
    }

    pub async fn get_faces_for_person_from_pool(pool: &SqlitePool, person_id: i64) -> Result<Vec<FaceRecord>> {
        let faces = sqlx::query_as::<_, FaceRecord>(
            r#"
            SELECT id, 
                   image_id, 
                   person_id,
                   bbox_x, 
                   bbox_y, 
                   bbox_width, 
                   bbox_height, 
                   confidence
            FROM faces 
            WHERE person_id = ?
            "#,
        )
        .bind(person_id)
        .fetch_all(pool)
        .await?;
        Ok(faces)
    }

    pub async fn get_images_for_person_from_pool(
        pool: &SqlitePool,
        person_id: i64,
    ) -> Result<Vec<ImageRecord>> {
        let images = sqlx::query_as::<_, ImageRecord>(
            r#"
            SELECT DISTINCT i.id,
                   i.folder_id,
                   i.file_path,
                   i.file_name,
                   i.file_extension,
                   i.file_size_bytes,
                   i.width,
                   i.height,
                   i.date_taken,
                   i.date_imported,
                   i.has_thumbnail,
                   i.has_preview,
                   i.rating,
                   i.is_favorite,
                   i.faces_indexed,
                   i.is_missing
            FROM images i
            JOIN faces f 
                ON f.image_id = i.id
            WHERE f.person_id = ?
            ORDER BY i.date_taken DESC
            "#,
        )
        .bind(person_id)
        .fetch_all(pool)
        .await?;
        Ok(images)
    }

    // ============================================
    // TAG MANAGEMENT
    // ============================================

    pub async fn list_tags_from_pool(pool: &SqlitePool) -> Result<Vec<TagRecord>> {
        let tags = sqlx::query_as::<_, TagRecord>(
            r#"
            SELECT id,
                   name, 
                   color
            FROM tags
            ORDER BY name ASC
            "#,
        )
        .fetch_all(pool)
        .await?;
        Ok(tags)
    }

    pub async fn create_tag_from_pool(pool: &SqlitePool, name: &str, color: Option<&str>) -> Result<i64> {
        let result = sqlx::query(
            r#"
            INSERT INTO tags (
                name, 
                color
            ) VALUES (?, ?)
            "#,
        )
        .bind(name)
        .bind(color)
        .execute(pool)
        .await?;
        
        Ok(result.last_insert_rowid())
    }

    pub async fn delete_tag_from_pool(pool: &SqlitePool, tag_id: i64) -> Result<()> {
        sqlx::query(
            r#"
            DELETE FROM tags 
            WHERE id = ?
            "#,
        )
        .bind(tag_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn tag_image_from_pool(pool: &SqlitePool, image_id: i64, tag_id: i64) -> Result<()> {
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO image_tags (
                image_id, 
                tag_id
            ) VALUES (?, ?)
            "#,
        )
        .bind(image_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn untag_image_from_pool(pool: &SqlitePool, image_id: i64, tag_id: i64) -> Result<()> {
        sqlx::query(
            r#"
            DELETE
            FROM image_tags
            WHERE image_id = ? 
                AND tag_id = ?
            "#,
        )
        .bind(image_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn get_tags_for_image_from_pool(pool: &SqlitePool, image_id: i64) -> Result<Vec<TagRecord>> {
        let tags = sqlx::query_as::<_, TagRecord>(
            r#"
            SELECT t.id, 
                   t.name, 
                   t.color
            FROM tags t
            JOIN image_tags it 
                ON it.tag_id = t.id
            WHERE it.image_id = ?
            ORDER BY t.name ASC
            "#,
        )
        .bind(image_id)
        .fetch_all(pool)
        .await?;
        Ok(tags)
    }

    // ============================================
    // ALBUM MANAGEMENT
    // ============================================

    pub async fn list_albums_from_pool(pool: &SqlitePool) -> Result<Vec<AlbumRecord>> {
        let albums = sqlx::query_as::<_, AlbumRecord>(r#"
            SELECT id, 
                   name, 
                   description, 
                   created_at
            FROM albums
            ORDER BY created_at DESC
            "#,
        )
        .fetch_all(pool)
        .await?;
        Ok(albums)
    }

    pub async fn create_album_from_pool(
        pool: &SqlitePool,
        name: &str,
        description: Option<&str>,
    ) -> Result<i64> {
        let result = sqlx::query(r#"
            INSERT INTO albums (
                name, 
                description
            ) VALUES (?, ?)
            "#,
        )
        .bind(name)
        .bind(description)
        .execute(pool)
        .await?;
        Ok(result.last_insert_rowid())
    }

    pub async fn delete_album_from_pool(pool: &SqlitePool, album_id: i64) -> Result<()> {
        sqlx::query(r#"
            DELETE
            FROM albums 
            WHERE id = ?
            "#,
        )
            .bind(album_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn add_image_to_album_from_pool(pool: &SqlitePool, album_id: i64, image_id: i64) -> Result<()> {
        sqlx::query(r#"
            INSERT OR IGNORE INTO album_images (
                album_id, 
                image_id
            ) VALUES (?, ?)
            "#,
        )
        .bind(album_id)
        .bind(image_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn remove_image_from_album_from_pool(pool: &SqlitePool, album_id: i64, image_id: i64) -> Result<()> {
        sqlx::query(r#"
            DELETE
            FROM album_images
            WHERE album_id = ? 
                AND image_id = ?
            "#,
        )
        .bind(album_id)
        .bind(image_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn get_images_for_album_from_pool(
        pool: &SqlitePool,
        album_id: i64,
        offset: i64,
        limit: i64,
    ) -> Result<Vec<ImageRecord>> {
        Self::filter_by_album_from_pool(pool, album_id, offset, limit).await
    }

    // ============================================
    // CATALOG STATS
    // ============================================

    pub async fn get_catalog_stats_from_pool(pool: &SqlitePool) -> Result<CatalogStats> {
        let total_images: i64 = sqlx::query_scalar(r#"
            SELECT COUNT(*) FROM images
            "#,
        )
        .fetch_one(pool)
        .await?;
        
        let total_faces: i64 = sqlx::query_scalar(r#"
            SELECT COUNT(*) FROM faces
            "#,
        )
        .fetch_one(pool)
        .await?;
        
        let total_people: i64 = sqlx::query_scalar(r#"
            SELECT COUNT(*) FROM people
            "#,
        )
        .fetch_one(pool)
        .await?;
        
        let total_folders: i64 = sqlx::query_scalar(r#"
            SELECT COUNT(*) FROM folders
            "#,
        )
        .fetch_one(pool)
        .await?;
        
        let total_tags: i64 = sqlx::query_scalar(r#"
            SELECT COUNT(*) 
            FROM tags
            "#,
        )
        .fetch_one(pool)
        .await?;
        
        let unindexed_faces: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) FROM images WHERE faces_indexed = 0 AND is_missing = 0
            "#,
        )
        .fetch_one(pool)
        .await?;

        let missing_files: i64 = sqlx::query_scalar(
            r#"
            SELECT COUNT(*) 
            FROM images 
            WHERE is_missing = 1
            "#,
        )
        .fetch_one(pool)
        .await?;

        Ok(CatalogStats {
            total_images,
            total_faces,
            total_people,
            total_folders,
            total_tags,
            unindexed_faces,
            missing_files,
        })
    }

    // ============================================
    // XMP EXPORT
    // ============================================

    pub async fn export_xmp_sidecars_from_pool(
        pool: &SqlitePool,
        image_ids: &[i64],
        output_dir: &str,
    ) -> Result<usize> {
        if image_ids.is_empty() {
            return Ok(0);
        }

        let placeholders: Vec<String> = (0..image_ids.len()).map(|i| format!("?{}", i + 1)).collect();
        let in_clause = placeholders.join(", ");

        let query = format!(
            "SELECT file_path, rating, is_favorite FROM images WHERE id IN ({})",
            in_clause
        );

        let mut query_builder = sqlx::query(&query);
        for id in image_ids {
            query_builder = query_builder.bind(id);
        }

        let rows = query_builder.fetch_all(pool).await?;
        let mut exported = 0;

        for row in rows {
            let file_path: String = row.try_get("file_path")?;
            let rating: i32 = row.try_get("rating")?;
            let is_favorite: bool = row.try_get("is_favorite")?;

            let xmp_path = Path::new(&file_path).with_extension("xmp");
            let mut xmp = String::from("<?xpacket begin=\"?id=\" id=\"W5M0MpCehiHzreSzNTczkc9d\"?>\n");
            xmp.push_str("<x:xmpmeta xmlns:x=\"adobe:ns:meta/\" x:xmptk=\"Praetorian\">\n");
            xmp.push_str("  <rdf:RDF xmlns:rdf=\"http://www.w3.org/1999/02/22-rdf-syntax-ns#\">\n");
            xmp.push_str("    <rdf:Description rdf:about=\"\"\n");
            xmp.push_str("      xmlns:Iptc4xmpCore=\"http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/\">\n");

            if rating > 0 {
                xmp.push_str(&format!("      <Iptc4xmpCore:Rating>{}</Iptc4xmpCore:Rating>\n", rating));
            }
            if is_favorite {
                xmp.push_str("      <Iptc4xmpCore:Keywords><rdf:Bag><rdf:li>favorite</rdf:li></rdf:Bag></Iptc4xmpCore:Keywords>\n");
            }

            xmp.push_str("    </rdf:Description>\n");
            xmp.push_str("  </rdf:RDF>\n");
            xmp.push_str("</x:xmpmeta>\n");
            xmp.push_str("<?xpacket end=\"w\"?>");

            let out_path = Path::new(output_dir).join(
                xmp_path.file_name().unwrap_or_default(),
            );
            fs::write(&out_path, xmp)
                .context(format!("Failed to write XMP: {}", out_path.display()))?;
            exported += 1;
        }

        Ok(exported)
    }

    /// Re-parses EXIF metadata for all images in the catalog.
    /// Useful when EXIF parsing was broken or after schema changes.
    pub async fn rebuild_metadata(&self) -> Result<usize> {
        let pool = self.db.pool();

        let images: Vec<(i64, String)> = sqlx::query_as(
            "SELECT id, file_path FROM images WHERE is_missing = 0",
        )
        .fetch_all(pool)
        .await?;

        log::info!("Rebuilding metadata for {} images", images.len());

        let mut updated = 0usize;

        for (image_id, file_path) in &images {
            if !std::path::Path::new(file_path).exists() {
                continue;
            }

            match self.exif_parser.parse(file_path) {
                Ok(exif) => {
                    // Update date_taken if we have it
                    if let Some(ref dt) = exif.date_time_original {
                        sqlx::query(
                            "UPDATE images SET date_taken = ? WHERE id = ?",
                        )
                        .bind(dt.as_str())
                        .bind(image_id)
                        .execute(pool)
                        .await?;
                    }

                    // Update dimensions if we have them
                    if exif.width.is_some() || exif.height.is_some() {
                        sqlx::query(
                            "UPDATE images SET width = ?, height = ? WHERE id = ?",
                        )
                        .bind(exif.width.map(|w| w as i32))
                        .bind(exif.height.map(|h| h as i32))
                        .bind(image_id)
                        .execute(pool)
                        .await?;
                    }

                    // Update or insert EXIF data
                    sqlx::query(
                        r#"
                        INSERT INTO exif_data (
                            image_id, camera_make, camera_model, lens_model,
                            iso, aperture_f_number, shutter_speed_num, shutter_speed_den,
                            focal_length_mm, gps_latitude, gps_longitude, gps_altitude
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(image_id) DO UPDATE SET
                            camera_make = EXCLUDED.camera_make,
                            camera_model = EXCLUDED.camera_model,
                            lens_model = EXCLUDED.lens_model,
                            iso = EXCLUDED.iso,
                            aperture_f_number = EXCLUDED.aperture_f_number,
                            shutter_speed_num = EXCLUDED.shutter_speed_num,
                            shutter_speed_den = EXCLUDED.shutter_speed_den,
                            focal_length_mm = EXCLUDED.focal_length_mm,
                            gps_latitude = EXCLUDED.gps_latitude,
                            gps_longitude = EXCLUDED.gps_longitude,
                            gps_altitude = EXCLUDED.gps_altitude
                        "#,
                    )
                    .bind(image_id)
                    .bind(exif.camera_make.as_deref())
                    .bind(exif.camera_model.as_deref())
                    .bind(exif.lens_model.as_deref())
                    .bind(exif.iso.map(|i| i as i32))
                    .bind(exif.aperture)
                    .bind(exif.shutter_num.map(|n| n as i32))
                    .bind(exif.shutter_den.map(|d| d as i32))
                    .bind(exif.focal_length)
                    .bind(exif.gps_latitude)
                    .bind(exif.gps_longitude)
                    .bind(exif.gps_altitude)
                    .execute(pool)
                    .await?;

                    updated += 1;
                }
                Err(e) => {
                    log::warn!("Failed to rebuild metadata for {}: {}", file_path, e);
                }
            }
        }

        log::info!("Rebuilt metadata for {} images", updated);
        Ok(updated)
    }
}
