//! Project fonts (`document.fonts`, files in `assets/fonts/`).

use crate::error::{AppError, AppResult};
use crate::project::format::FontFile;
use crate::project::{fonts, ProjectState};
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

/// Imports a font file into the current project (raw body: the file's bytes).
///
/// # Returns
/// What to store as `ProjectFont.regular` / `bold`. The font list itself is document content and
/// changes through the editor (undoable), so nothing else is written here.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for a file that cannot be used (see `fonts::analyze`).
#[tauri::command]
pub async fn font_import(state: State<'_, ProjectState>, request: Request<'_>) -> AppResult<FontFile> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid_input("字型資料格式不正確"));
    };
    let bytes = bytes.clone();
    let root = state.current()?.root;
    // 中文字型 10–30 MB：算雜湊、交給 Typst 檢查都要一點時間，不佔 async runtime
    tauri::async_runtime::spawn_blocking(move || fonts::import_font(&root, &bytes))
        .await
        .map_err(|error| AppError::invalid_input(format!("匯入字型中斷：{error}")))?
}
