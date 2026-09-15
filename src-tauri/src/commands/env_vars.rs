use crate::db::{DbError, DbResult, DbState};
use rusqlite::params;
use serde::Serialize;

const MAX_KEY_LEN: usize = 256;

#[derive(Serialize)]
pub struct EnvVar {
    pub key: String,
    pub value: String,
}

// IPC 參數來自 WebView，不可信任，寫入前驗證
fn validate_key(key: &str) -> DbResult<()> {
    if key.trim().is_empty() {
        return Err(DbError::InvalidInput("key must not be empty"));
    }
    if key.len() > MAX_KEY_LEN {
        return Err(DbError::InvalidInput("key is too long"));
    }
    Ok(())
}

/// Lists all stored environment variables in insertion order.
#[tauri::command]
pub fn get_env_vars(state: tauri::State<'_, DbState>) -> DbResult<Vec<EnvVar>> {
    let conn = state.conn()?;
    let mut stmt = conn.prepare("SELECT key, value FROM env_vars ORDER BY rowid")?;
    let vars = stmt
        .query_map([], |row| Ok(EnvVar { key: row.get(0)?, value: row.get(1)? }))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(vars)
}

/// Inserts or updates an environment variable.
#[tauri::command]
pub fn upsert_env_var(state: tauri::State<'_, DbState>, key: String, value: String) -> DbResult<()> {
    validate_key(&key)?;
    let conn = state.conn()?;
    conn.execute(
        "INSERT INTO env_vars (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Deletes an environment variable; no-op if the key does not exist.
#[tauri::command]
pub fn delete_env_var(state: tauri::State<'_, DbState>, key: String) -> DbResult<()> {
    validate_key(&key)?;
    let conn = state.conn()?;
    conn.execute("DELETE FROM env_vars WHERE key = ?1", params![key])?;
    Ok(())
}