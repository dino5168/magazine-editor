//! Crash-recovery commands. The frontend writes unsaved content periodically; the file is removed
//! when the project is saved, when another project replaces it, or when the window closes normally.

use super::project::{activate, untitled_base};
use crate::db::DbState;
use crate::error::AppResult;
use crate::project::format::ProjectContent;
use crate::project::recovery::{self, RecoveryEntry, RECOVERY_DIR};
use crate::project::{self, library, OpenedProject, ProjectState};
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};

pub(crate) fn recovery_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_local_data_dir()?.join(RECOVERY_DIR))
}

/// Deletes the current project's recovery file. Called when the window is destroyed: that only
/// happens after a normal close, so a crash leaves the file behind for the next start.
pub fn clear_current(app: &AppHandle) {
    let state = app.state::<ProjectState>();
    if let (Ok(Some(project)), Ok(dir)) = (state.lock().map(|slot| slot.clone()), recovery_dir(app)) {
        let _ = recovery::remove(&dir, &project.id);
    }
}

/// Lists recovery files left by a previous session, newest first.
#[tauri::command]
pub async fn recovery_list(app: AppHandle) -> AppResult<Vec<RecoveryEntry>> {
    recovery::list(&recovery_dir(&app)?)
}

/// Opens the project a recovery file belongs to, with the recovered (unsaved) content.
/// The recovery file is kept until the content is saved or discarded.
#[tauri::command]
pub async fn recovery_restore(
    app: AppHandle,
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
    id: String,
) -> AppResult<OpenedProject> {
    let file = recovery::read(&recovery_dir(&app)?, &id)?;
    let project = recovery::restore_project(&file)?;
    // 素材庫是立即寫入的，不在備份檔裡；從專案資料夾讀（不清理沒引用的檔案，同備份的圖片）
    let loaded = library::load_or_create(&project.root, &file.content.assets, &project::now())?;
    let info = activate(&app, &state, &db, project, &file.content.document.name)?;
    Ok(OpenedProject {
        info,
        content: file.content,
        recovered_from_backup: false,
        library: loaded.library,
        library_rebuilt: loaded.rebuilt,
    })
}

/// Deletes a recovery file the user chose not to restore, plus its untitled staging folder.
#[tauri::command]
pub async fn recovery_discard(app: AppHandle, id: String) -> AppResult<()> {
    let dir = recovery_dir(&app)?;
    if let Ok(file) = recovery::read(&dir, &id) {
        let root = PathBuf::from(&file.project_root);
        // 只刪除 App 自己的暫存資料夾；專案根目錄來自檔案內容，不能無條件刪除
        if file.untitled && root.parent() == Some(untitled_base(&app)?.as_path()) {
            let _ = std::fs::remove_dir_all(root);
        }
    }
    recovery::remove(&dir, &id)
}

/// Writes the current project's unsaved content to its recovery file.
#[tauri::command]
pub async fn recovery_write(app: AppHandle, state: State<'_, ProjectState>, content: ProjectContent) -> AppResult<()> {
    recovery::write(&recovery_dir(&app)?, &state.current()?, content)
}

/// Deletes the current project's recovery file (its content is no longer unsaved).
#[tauri::command]
pub async fn recovery_clear(app: AppHandle, state: State<'_, ProjectState>) -> AppResult<()> {
    recovery::remove(&recovery_dir(&app)?, &state.current()?.id)
}
