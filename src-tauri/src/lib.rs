mod commands;
mod db;
mod error;
mod export;
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
            app.manage(commands::export::ExportState::default());
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
            commands::recovery::recovery_list,
            commands::recovery::recovery_restore,
            commands::recovery::recovery_discard,
            commands::recovery::recovery_write,
            commands::recovery::recovery_clear,
            commands::export::export_pdf_choose_path,
            commands::export::export_pdf,
            commands::export::export_open_last,
        ])
        // 視窗只會在正常關閉時被 destroy（當機不會），此時才刪除自動備份
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                commands::recovery::clear_current(window.app_handle());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
