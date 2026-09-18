use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

pub struct DbState(pub Mutex<Connection>);

impl DbState {
    /// Locks the shared connection.
    ///
    /// # Errors
    /// Returns `AppError::LockPoisoned` if a previous holder panicked.
    pub fn conn(&self) -> AppResult<MutexGuard<'_, Connection>> {
        self.0.lock().map_err(|_| AppError::LockPoisoned)
    }
}

/// Opens (or creates) the SQLite database and applies migrations.
///
/// # Errors
/// Returns `AppError::Sqlite` if the file cannot be opened or migration fails.
pub fn open(path: &Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

// 每個元素把 schema 從 index 版升到 index + 1 版；只能在尾端新增，不可修改已發布的步驟
const MIGRATIONS: &[&str] = &[
    "CREATE TABLE IF NOT EXISTS env_vars (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL DEFAULT ''
    );",
    "CREATE TABLE recent_projects (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        path      TEXT NOT NULL UNIQUE,
        name      TEXT NOT NULL,
        opened_at TEXT NOT NULL
    );",
];

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let applied = usize::try_from(current).unwrap_or(0);
    for (index, sql) in MIGRATIONS.iter().enumerate().skip(applied) {
        conn.execute_batch(&format!("BEGIN; {sql} PRAGMA user_version = {}; COMMIT;", index + 1))?;
    }
    Ok(())
}

/// Number of entries kept in `recent_projects`.
pub const RECENT_LIMIT: i64 = 10;

/// Records (or refreshes) a project in the recent list and trims old entries.
///
/// # Errors
/// Returns `AppError::Sqlite` on database failure.
pub fn touch_recent(conn: &Connection, path: &str, name: &str, opened_at: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO recent_projects (path, name, opened_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(path) DO UPDATE SET name = excluded.name, opened_at = excluded.opened_at",
        params![path, name, opened_at],
    )?;
    conn.execute(
        "DELETE FROM recent_projects WHERE id NOT IN
         (SELECT id FROM recent_projects ORDER BY opened_at DESC, id DESC LIMIT ?1)",
        params![RECENT_LIMIT],
    )?;
    Ok(())
}

/// Returns the most recently opened project path.
///
/// # Errors
/// Returns `AppError::Sqlite` on database failure.
pub fn last_recent_path(conn: &Connection) -> AppResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT path FROM recent_projects ORDER BY opened_at DESC, id DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?)
}

/// Removes a project from the recent list (e.g. it no longer exists).
///
/// # Errors
/// Returns `AppError::Sqlite` on database failure.
pub fn remove_recent(conn: &Connection, path: &str) -> AppResult<()> {
    conn.execute("DELETE FROM recent_projects WHERE path = ?1", params![path])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn memory() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn migrate_is_idempotent_and_sets_version() {
        let conn = memory();
        migrate(&conn).unwrap();
        let version: i64 = conn.query_row("PRAGMA user_version", [], |row| row.get(0)).unwrap();
        assert_eq!(usize::try_from(version).unwrap(), MIGRATIONS.len());
    }

    #[test]
    fn touch_recent_upserts_and_trims() {
        let conn = memory();
        for i in 0..12 {
            touch_recent(&conn, &format!("C:\\p{i}"), "n", &format!("2026-01-01T00:00:{i:02}Z")).unwrap();
        }
        touch_recent(&conn, "C:\\p11", "renamed", "2026-01-02T00:00:00Z").unwrap();
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM recent_projects", [], |r| r.get(0)).unwrap();
        assert_eq!(count, RECENT_LIMIT);
        assert_eq!(last_recent_path(&conn).unwrap().as_deref(), Some("C:\\p11"));
        remove_recent(&conn, "C:\\p11").unwrap();
        assert_eq!(last_recent_path(&conn).unwrap().as_deref(), Some("C:\\p10"));
    }
}
