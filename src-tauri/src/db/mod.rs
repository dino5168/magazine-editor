use rusqlite::Connection;
use serde::{ser::SerializeStruct, Serialize, Serializer};
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

pub struct DbState(pub Mutex<Connection>);

impl DbState {
    /// Locks the shared connection.
    ///
    /// # Errors
    /// Returns `DbError::LockPoisoned` if a previous holder panicked.
    pub fn conn(&self) -> DbResult<MutexGuard<'_, Connection>> {
        self.0.lock().map_err(|_| DbError::LockPoisoned)
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("database lock poisoned")]
    LockPoisoned,
    #[error("invalid input: {0}")]
    InvalidInput(&'static str),
}

impl DbError {
    fn kind(&self) -> &'static str {
        match self {
            Self::Sqlite(_) => "sqlite",
            Self::LockPoisoned => "lockPoisoned",
            Self::InvalidInput(_) => "invalidInput",
        }
    }
}

// 以 { kind, message } 序列化，前端可依 kind 做 type narrowing，而非解析錯誤字串
impl Serialize for DbError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut s = serializer.serialize_struct("DbError", 2)?;
        s.serialize_field("kind", self.kind())?;
        s.serialize_field("message", &self.to_string())?;
        s.end()
    }
}

pub type DbResult<T> = Result<T, DbError>;

/// Opens (or creates) the SQLite database and applies migrations.
///
/// # Errors
/// Returns `DbError::Sqlite` if the file cannot be opened or migration fails.
pub fn open(path: &Path) -> DbResult<Connection> {
    let conn = Connection::open(path)?;
    migrate(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS env_vars (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT ''
        );",
    )
}