use std::path::{Path, PathBuf};

use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use anyhow::Result;

use sqlx::SqlitePool;

/// Thumbnail dimensions for the grid view.
const THUMB_MAX_DIM: u32 = 160;

/// Smart preview maximum long edge.
const PREVIEW_MAX_DIM: u32 = 2048;

/// JPEG quality for thumbnails (0-100).
const THUMB_QUALITY: u8 = 75;

/// JPEG quality for smart previews.
const PREVIEW_QUALITY: u8 = 85;

/// Maximum concurrent image processing tasks.
const MAX_CONCURRENT_TASKS: usize = 4;

/// How often the worker polls the DB queue when the channel is empty (ms).
const DB_POLL_INTERVAL_MS: u64 = 200;

/// Represents a queued image processing job.
#[derive(Debug, Clone)]
pub struct ProcessingJob {
    pub queue_id: i64,
    pub image_id: i64,
    pub file_path: String,
    pub job_type: JobType,
}

#[derive(Debug, Clone, PartialEq)]
pub enum JobType {
    Thumbnail,
    Preview,
}

/// The image processing pipeline.
///
/// Runs a background worker that drains jobs from a tokio channel and the
/// persistent `processing_queue` SQLite table. Jobs submitted via `submit`
/// go through the channel for immediate processing. When the channel drains,
/// the worker polls the DB for any persisted jobs (crash-recovery / backlog).
pub struct ImagePipeline {
    cache_dir: PathBuf,
    sender: mpsc::Sender<ProcessingJob>,
    receiver: Option<mpsc::Receiver<ProcessingJob>>,
    worker_handle: Option<JoinHandle<()>>,
}

impl ImagePipeline {
    pub fn new(cache_dir: PathBuf) -> Self {
        let (sender, receiver) = mpsc::channel(512);
        Self {
            cache_dir,
            sender,
            receiver: Some(receiver),
            worker_handle: None,
        }
    }

    /// Starts the background processing worker.
    /// Spawns a tokio task that processes jobs without blocking the Tauri UI thread.
    pub fn start(&mut self, pool: SqlitePool) {
        let receiver = self
            .receiver
            .take()
            .expect("Worker already started; receiver was consumed");
        let cache_dir = self.cache_dir.clone();

        let handle = tokio::spawn(async move {
            Self::worker_loop(receiver, cache_dir, pool).await;
        });

        self.worker_handle = Some(handle);
        log::info!("ImagePipeline worker started");
    }

    /// Submits a job to the processing channel for immediate pickup by the worker.
    pub async fn submit(&self, job: ProcessingJob) -> Result<()> {
        self.sender
            .send(job)
            .await
            .map_err(|e| anyhow::anyhow!("Pipeline channel closed: {}", e))
    }

    /// Submits thumbnail generation for a batch of images.
    pub async fn queue_thumbnails(&self, images: &[(i64, String)]) -> Result<()> {
        for (image_id, source_path) in images {
            self.submit(ProcessingJob {
                queue_id: 0,
                image_id: *image_id,
                file_path: source_path.clone(),
                job_type: JobType::Thumbnail,
            })
            .await?;
        }
        Ok(())
    }

    /// Submits smart preview generation for a batch of images.
    pub async fn queue_previews(&self, images: &[(i64, String)]) -> Result<()> {
        for (image_id, source_path) in images {
            self.submit(ProcessingJob {
                queue_id: 0,
                image_id: *image_id,
                file_path: source_path.clone(),
                job_type: JobType::Preview,
            })
            .await?;
        }
        Ok(())
    }

    /// Core worker loop: processes jobs from the channel, then polls the DB queue.
    async fn worker_loop(
        mut receiver: mpsc::Receiver<ProcessingJob>,
        cache_dir: PathBuf,
        pool: SqlitePool,
    ) {
        log::info!("Worker loop started, cache_dir={}", cache_dir.display());

        loop {
            // Phase 1: drain channel jobs with timeout
            match tokio::time::timeout(
                tokio::time::Duration::from_millis(DB_POLL_INTERVAL_MS),
                receiver.recv(),
            )
            .await {
                Ok(Some(job)) => {
                    Self::process_job(job, &cache_dir, &pool).await;
                    continue;
                }
                Ok(None) => {
                    // Channel closed
                    break;
                }
                Err(_) => {
                    // Timeout — poll DB for persisted jobs
                }
            }

            // Phase 2: poll DB queue for pending jobs
            if let Err(e) = Self::drain_db_queue(&cache_dir, &pool).await {
                log::error!("Error draining DB queue: {}", e);
            }
        }

        log::info!("Worker loop exited (channel closed)");
    }

    /// Polls the `processing_queue` table for pending jobs and processes them.
    async fn drain_db_queue(cache_dir: &Path, pool: &SqlitePool) -> Result<()> {
        let pending: Vec<(i64, i64, String, String)> = sqlx::query_as(
            r#"
            SELECT pq.id, 
                   pq.image_id, 
                   i.file_path, 
                   pq.task_type
            FROM processing_queue pq
            JOIN images i 
                ON i.id = pq.image_id
            WHERE pq.status = 'pending'
            ORDER BY pq.priority DESC
            LIMIT ?
            "#,
        )
        .bind(MAX_CONCURRENT_TASKS as i64)
        .fetch_all(pool)
        .await?;

        if pending.is_empty() {
            return Ok(());
        }

        let mut handles = Vec::new();

        for (queue_id, image_id, file_path, task_type) in pending {
            let job_type = match task_type.as_str() {
                "thumbnail" => JobType::Thumbnail,
                "preview" => JobType::Preview,
                _ => {
                    log::warn!("Unknown task_type '{}', skipping", task_type);
                    continue;
                }
            };

            let job = ProcessingJob {
                queue_id,
                image_id,
                file_path,
                job_type,
            };

            let cd = cache_dir.to_path_buf();
            let p = pool.clone();

            let handle = tokio::spawn(async move {
                Self::process_job(job, &cd, &p).await;
            });
            handles.push(handle);
        }

        // Wait for all spawned jobs to complete
        for handle in handles {
            let _ = handle.await;
        }

        Ok(())
    }

    /// Dispatches a single job to the appropriate generation function.
    async fn process_job(job: ProcessingJob, cache_dir: &Path, pool: &SqlitePool) {
        let queue_id = job.queue_id;
        let image_id = job.image_id;
        let source = job.file_path.clone();

        log::debug!(
            "Processing job: image_id={}, type={:?}",
            image_id,
            job.job_type
        );

        // Mark as in-progress if from DB queue
        if queue_id > 0 {
            if let Err(e) = sqlx::query(
                r#"
                UPDATE processing_queue 
                SET status = 'in_progress', 
                    started_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') 
                WHERE id = ?
                "#,
            )
            .bind(queue_id)
            .execute(pool)
            .await
            {
                log::error!("Failed to mark job {} as in_progress: {}", queue_id, e);
            }
        }

        let result = match job.job_type {
            JobType::Thumbnail => {
                Self::generate_thumbnail(&source, image_id, cache_dir, pool).await
            }
            JobType::Preview => {
                Self::generate_preview(&source, image_id, cache_dir, pool).await
            }
        };

        // Update DB queue status
        if queue_id > 0 {
            match &result {
                Ok(_) => {
                    if let Err(e) = sqlx::query(
                        r#"
                        UPDATE processing_queue 
                        SET status = 'completed', 
                            completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') 
                        WHERE id = ?
                        "#,
                    )
                    .bind(queue_id)
                    .execute(pool)
                    .await
                    {
                        log::error!("Failed to mark job {} as completed: {}", queue_id, e);
                    }
                }
                Err(e) => {
                    let err_msg = e.to_string();
                    if let Err(db_e) = sqlx::query(
                        r#"
                        UPDATE processing_queue 
                        SET status = 'failed', 
                            error_message = ?, 
                            completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') 
                        WHERE id = ?
                        "#,
                    )
                    .bind(&err_msg)
                    .bind(queue_id)
                    .execute(pool)
                    .await
                    {
                        log::error!("Failed to mark job {} as failed: {}", queue_id, db_e);
                    }
                }
            }
        }

        match result {
            Ok(_) => {
                log::debug!(
                    "Completed {:?} for image {}",
                    job.job_type,
                    image_id
                );
            }
            Err(e) => {
                log::error!(
                    "Failed {:?} for image {} ({}) : {}",
                    job.job_type,
                    image_id,
                    source,
                    e
                );
            }
        }
    }

    /// Generates a tiny thumbnail (160px max, 75% quality).
    async fn generate_thumbnail(
        source_path: &str,
        image_id: i64,
        cache_dir: &Path,
        pool: &SqlitePool,
    ) -> Result<()> {
        let output_path = cache_dir.join(format!("thumb_{}.jpg", image_id));

        // Try to generate thumbnail, but don't fail if the image is corrupted
        if let Err(e) = Self::resize_and_save(source_path, &output_path, THUMB_MAX_DIM, THUMB_QUALITY) {
            log::warn!("Failed to generate thumbnail for image {} ({}) : {}", image_id, source_path, e);
            // Mark as failed so we don't keep retrying
            sqlx::query(
               r#"
                UPDATE images 
                SET has_thumbnail = 0, 
                    thumbnail_hash = NULL 
                WHERE id = ?
                "#,
            )
            .bind(image_id)
            .execute(pool)
            .await?;
            return Err(e);
        }

        sqlx::query(
           r#"
            UPDATE images 
            SET has_thumbnail = 1, 
                thumbnail_hash = ? 
            WHERE id = ?
            "#,
        )
        .bind(output_path.file_name().unwrap().to_string_lossy().to_string())
        .bind(image_id)
        .execute(pool)
        .await?;

        log::debug!("Generated thumbnail for image {}", image_id);
        Ok(())
    }

    /// Generates a smart preview (2048px max, 85% quality).
    async fn generate_preview(
        source_path: &str,
        image_id: i64,
        cache_dir: &Path,
        pool: &SqlitePool,
    ) -> Result<()> {
        let output_path = cache_dir.join(format!("preview_{}.jpg", image_id));

        // Try to generate preview, but don't fail if the image is corrupted
        if let Err(e) = Self::resize_and_save(source_path, &output_path, PREVIEW_MAX_DIM, PREVIEW_QUALITY) {
            log::warn!("Failed to generate preview for image {} ({}) : {}", image_id, source_path, e);
            // Mark as failed so we don't keep retrying
            // TODO: Consider making an object, like a data source, to facilitate and encapsulate this kind of DB update logic, to avoid inline SQL statements scattered throughout the codebase.
            sqlx::query(
                r#"
                UPDATE images 
                SET has_preview = 0, 
                    preview_hash = NULL 
                WHERE id = ?
                "#,
            )
            .bind(image_id)
            .execute(pool)
            .await?;
            return Err(e);
        }

        sqlx::query(
            r#"
            UPDATE images 
            SET has_preview = 1, 
                preview_hash = ? 
            WHERE id = ?
            "#,
        )
        .bind(output_path.file_name().unwrap().to_string_lossy().to_string())
        .bind(image_id)
        .execute(pool)
        .await?;

        log::debug!("Generated preview for image {}", image_id);
        Ok(())
    }

    /// Resizes an image to the given max dimension and saves as JPEG.
    /// Uses libvips when the `vips` feature is enabled, otherwise falls back to `image`.
    /// If the primary method fails, tries the other as a fallback for corrupted files.
    fn resize_and_save(
        input: &str,
        output: &Path,
        max_dim: u32,
        quality: u8,
    ) -> Result<()> {
        #[cfg(feature = "vips")]
        {
            if let Err(e) = Self::resize_with_vips(input, output, max_dim, quality) {
                log::warn!("vips resize failed for {}, falling back to image crate: {}", input, e);
                return Self::resize_with_image(input, output, max_dim, quality);
            }
            return Ok(());
        }

        #[cfg(not(feature = "vips"))]
        {
            return Self::resize_with_image(input, output, max_dim, quality);
        }
    }

    /// Resize using libvips (fast, supports RAW via built-in loaders).
    #[cfg(feature = "vips")]
    fn resize_with_vips(
        input: &str,
        output: &Path,
        max_dim: u32,
        quality: u8,
    ) -> Result<()> {
        use std::ffi::CString;
        use std::os::raw::c_char;
        use std::ptr::null;

        let output_str = output
            .to_str()
            .ok_or_else(|| anyhow::anyhow!("Invalid output path"))?;
        let out_c = CString::new(output_str)?;

        // Load image from file
        let img = vips::VipsImage::from_file(input)?;

        // Create thumbnail (downscale to fit within max_dim x max_dim)
        let thumb = img.thumbnail(
            max_dim,
            max_dim,
            vips::VipsSize::VIPS_SIZE_DOWN,
        )?;

        // Write as JPEG with quality setting
        let ret = unsafe {
            vips_sys::vips_jpegsave(
                thumb.c,
                out_c.as_ptr(),
                c"Q".as_ptr(),
                quality as i32,
                null() as *const c_char,
            )
        };

        if ret != 0 {
            anyhow::bail!(
                "vips_jpegsave failed: {}",
                vips::take_vips_error()
                    .unwrap_or_else(|| "Unknown vips error".to_string())
            );
        }

        Ok(())
    }

    /// Resize using the `image` crate (slower, no RAW support).
    #[cfg(not(feature = "vips"))]
    fn resize_with_image(
        input: &str,
        output: &Path,
        max_dim: u32,
        quality: u8,
    ) -> Result<()> {
        use image::codecs::jpeg::JpegEncoder;
        use image::{ExtendedColorType, GenericImageView, ImageEncoder, ImageReader};

        let img = ImageReader::open(input)?.decode()?;
        let (w, h) = img.dimensions();

        let scale = if w > h {
            max_dim as f64 / w as f64
        } else {
            max_dim as f64 / h as f64
        };

        let rgb8 = if scale >= 1.0 {
            img.into_rgb8()
        } else {
            let new_w = (w as f64 * scale).max(1.0) as u32;
            let new_h = (h as f64 * scale).max(1.0) as u32;
            img.resize(new_w, new_h, image::imageops::FilterType::Lanczos3)
                .into_rgb8()
        };

        let (out_w, out_h) = rgb8.dimensions();
        let mut buf = Vec::new();
        let encoder = JpegEncoder::new_with_quality(&mut buf, quality);
        encoder.write_image(
            rgb8.as_raw(),
            out_w,
            out_h,
            ExtendedColorType::Rgb8,
        )?;
        std::fs::write(output, buf)?;

        Ok(())
    }
}
