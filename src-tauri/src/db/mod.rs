pub mod schema;
pub mod migrations;

use sqlx::sqlite::SqliteConnectOptions;
use sqlx::SqlitePool;
use migrations::run_migrations;

/// Represents the open Praetorian catalog (SQLite connection pool).
pub struct Database {
    pub pool: SqlitePool,
}

impl Database {
    /// Opens an existing `.praetorian` catalog or creates a new one.
    pub async fn open_or_create(path: &str) -> Result<Self, sqlx::Error> {
        // Ensure parent directory exists
        if let Some(parent) = std::path::Path::new(path).parent() {
            log::info!("Ensuring parent dir exists: {}", parent.display());
            if !parent.exists() {
                log::info!("Creating parent dir: {}", parent.display());
                std::fs::create_dir_all(parent).expect("Failed to create parent directory");
            }
        }

        // Build connection options with explicit settings for Windows compatibility.
        let options = SqliteConnectOptions::new()
            .filename(path)
            .create_if_missing(true)
            .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
            .foreign_keys(true);

        log::info!("Connecting to SQLite: {}", path);

        // Connection pool sized for concurrent image processing tasks.
        // WAL mode is enabled, allowing concurrent reads and serialised writes.
        let pool = sqlx::pool::PoolOptions::new()
            .max_connections(num_cpus::get().min(8) as u32)
            .connect_with(options)
            .await
            .map_err(|e| {
                log::error!("SQLite connect failed: {}", e);
                e
            })?;
        log::info!("SQLite connection established");

        // Set cache size after connection
        sqlx::query("PRAGMA cache_size = -64000;") // 64MB cache
            .execute(&pool)
            .await
            .map_err(|e| {
                log::error!("PRAGMA cache_size failed: {}", e);
                e
            })?;

        run_migrations(&pool).await.map_err(|e| {
            log::error!("Migrations failed: {}", e);
            e
        })?;
        log::info!("Migrations applied successfully");

        Ok(Self { pool })
    }

    /// Returns the connection pool for use by other modules.
    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}
