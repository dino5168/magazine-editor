mod commands;
mod db;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // 安裝於 Program Files 時 exe 目錄不可寫；DB 放在 per-user app data（%APPDATA%\<identifier>）
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join("app.db"))?;
            app.manage(db::DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::env_vars::get_env_vars,
            commands::env_vars::upsert_env_var,
            commands::env_vars::delete_env_var,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}