mod commands;
mod db;
mod error;
mod project;

use std::sync::Mutex;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 必須最先註冊：第二個實例啟動時直接結束，避免兩個視窗同時寫入同一個專案
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // 安裝於 Program Files 時 exe 目錄不可寫；DB 放在 per-user app data（%APPDATA%\<identifier>）
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let conn = db::open(&data_dir.join("app.db"))?;
            app.manage(db::DbState(Mutex::new(conn)));
            app.manage(project::ProjectState::default());
            commands::project::clear_untitled(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::env_vars::get_env_vars,
            commands::env_vars::upsert_env_var,
            commands::env_vars::delete_env_var,
            commands::project::project_new,
            commands::project::project_open_last,
            commands::project::project_open_dialog,
            commands::project::project_save,
            commands::project::project_save_as_dialog,
            commands::project::asset_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
