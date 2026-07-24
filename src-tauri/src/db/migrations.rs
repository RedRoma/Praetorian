use sqlx::SqlitePool;

/// Runs all database migrations against the pool.
/// Each migration is a named SQL block. Order matters.
pub async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    log::info!("Running migrations...");

    // Create a tracking table for applied migrations
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        );",
    )
    .execute(pool)
    .await
    .map_err(|e| {
        log::error!("Failed to create _migrations table: {}", e);
        e
    })?;

    let migrations: &[(&str, &str)] = &[
        (
            "001_create_all_tables",
            include_str!("./schema.sql"),
        ),
    ];

    for (name, sql) in migrations {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM _migrations WHERE name = ?)",
        )
        .bind(name)
        .fetch_one(pool)
        .await?;

        if !exists {
            log::info!("Applying migration: {}", name);
            sqlx::query(sql).execute(pool).await.map_err(|e| {
                log::error!("Migration {} failed: {}", name, e);
                e
            })?;
            sqlx::query("INSERT INTO _migrations (name) VALUES (?)")
                .bind(name)
                .execute(pool)
                .await?;
            log::info!("Migration {} applied", name);
        } else {
            log::info!("Migration {} already applied, skipping", name);
        }
    }

    Ok(())
}
