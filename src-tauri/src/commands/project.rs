use crate::db::{self, DbState};
use crate::error::{AppError, AppResult};
use crate::project::format::ProjectContent;
use crate::project::{self, assets, io, OpenProject, OpenedProject, ProjectInfo, ProjectState};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const UNTITLED_DIR: &str = "untitled";
const DEFAULT_PROJECTS_DIR: &str = "雜誌編輯軟體";
const PROJECT_EXTENSION: &str = "magproj";
const PROJECT_FILTER_NAME: &str = "雜誌專案";
const FALLBACK_PROJECT_NAME: &str = "未命名專案";

fn untitled_base(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_local_data_dir()?.join(UNTITLED_DIR))
}

/// Deletes leftover untitled projects from previous sessions. Safe at startup because the
/// single-instance plugin guarantees no other process is using them.
pub fn clear_untitled(app: &AppHandle) {
    if let Ok(base) = untitled_base(app) {
        let _ = std::fs::remove_dir_all(base);
    }
}

// 對話框的預設位置：文件\雜誌編輯軟體（不存在就建立；失敗時退回文件資料夾）
fn default_projects_dir(app: &AppHandle) -> Option<PathBuf> {
    let documents = app.path().document_dir().ok()?;
    let dir = documents.join(DEFAULT_PROJECTS_DIR);
    Some(if std::fs::create_dir_all(&dir).is_ok() { dir } else { documents })
}

/// Makes `project` the current one: grants the asset protocol access to its folder and records
/// it in the recent list.
fn activate(
    app: &AppHandle,
    state: &ProjectState,
    db: &DbState,
    project: OpenProject,
    document_name: &str,
) -> AppResult<ProjectInfo> {
    // asset protocol 的 scope 預設為空；專案位置由使用者自選，只能在執行時開放
    app.asset_protocol_scope().allow_directory(&project.root, true)?;
    if !project.untitled {
        let path = project.root.to_string_lossy();
        db::touch_recent(&*db.conn()?, &path, document_name, &project::now())?;
    }
    let info = project.info();
    *state.lock()? = Some(project);
    Ok(info)
}

fn open_and_activate(
    app: &AppHandle,
    state: &ProjectState,
    db: &DbState,
    root: &Path,
) -> AppResult<OpenedProject> {
    let (opened, project) = project::open(root)?;
    activate(app, state, db, project, &opened.content.document.name)?;
    Ok(opened)
}

/// Creates an unsaved project in the local app-data staging folder.
#[tauri::command]
pub fn project_new(app: AppHandle, state: State<'_, ProjectState>, db: State<'_, DbState>) -> AppResult<ProjectInfo> {
    let project = project::create_untitled(&untitled_base(&app)?)?;
    activate(&app, &state, &db, project, "")
}

/// Reopens the most recently used project. Returns `None` when there is none.
///
/// # Errors
/// The open error, so the frontend can tell the user why it started with a new project.
/// A project folder that no longer exists is removed from the recent list.
#[tauri::command]
pub fn project_open_last(
    app: AppHandle,
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
) -> AppResult<Option<OpenedProject>> {
    let Some(path) = db::last_recent_path(&*db.conn()?)? else {
        return Ok(None);
    };
    match open_and_activate(&app, &state, &db, Path::new(&path)) {
        Ok(opened) => Ok(Some(opened)),
        Err(AppError::Io(error)) if error.kind() == ErrorKind::NotFound => {
            db::remove_recent(&*db.conn()?, &path)?;
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

/// Shows the open dialog (filtered to `project.magproj`) and opens the chosen project.
/// Returns `None` when the user cancels.
// 對話框使用 blocking API，必須是 async command 才不會在主執行緒上等待
#[tauri::command]
pub async fn project_open_dialog(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
) -> AppResult<Option<OpenedProject>> {
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("開啟專案")
        .add_filter(PROJECT_FILTER_NAME, &[PROJECT_EXTENSION]);
    if let Some(dir) = default_projects_dir(&app) {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_pick_file() else {
        return Ok(None);
    };
    let file = picked.into_path().map_err(|error| AppError::invalid_input(error.to_string()))?;
    let root = file.parent().ok_or_else(|| AppError::invalid_input("invalid project path"))?;
    open_and_activate(&app, &state, &db, root).map(Some)
}

/// Saves to the current project's folder.
///
/// # Errors
/// `AppError::InvalidInput` for an untitled project (the frontend must use save-as).
#[tauri::command]
pub fn project_save(
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
    content: ProjectContent,
) -> AppResult<()> {
    let project = state.current()?;
    if project.untitled {
        return Err(AppError::invalid_input("untitled project must be saved with save-as"));
    }
    let name = content.document.name.clone();
    project::save(&project, content)?;
    db::touch_recent(&*db.conn()?, &project.root.to_string_lossy(), &name, &project::now())
}

/// Asks for a project name and location, then saves a copy there and switches to it.
/// Returns `None` when the user cancels.
#[tauri::command]
pub async fn project_save_as_dialog(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, ProjectState>,
    db: State<'_, DbState>,
    content: ProjectContent,
    suggested_name: String,
) -> AppResult<Option<ProjectInfo>> {
    let current = state.current()?;
    let default_name = io::sanitize_folder_name(&suggested_name).unwrap_or_else(|_| FALLBACK_PROJECT_NAME.to_owned());
    // 篩選器讓對話框自動補上 .magproj；輸入的名稱去掉副檔名後就是專案資料夾名稱
    let mut dialog = app
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("另存專案：輸入專案名稱（會建立同名資料夾）")
        .set_file_name(format!("{default_name}.{PROJECT_EXTENSION}"))
        .add_filter(PROJECT_FILTER_NAME, &[PROJECT_EXTENSION]);
    if let Some(dir) = default_projects_dir(&app) {
        dialog = dialog.set_directory(dir);
    }
    let Some(picked) = dialog.blocking_save_file() else {
        return Ok(None);
    };
    let picked = picked.into_path().map_err(|error| AppError::invalid_input(error.to_string()))?;
    let target = project_root_from_save_path(&picked)?;

    let name = content.document.name.clone();
    let saved = project::save_as(&current, &target, content)?;
    if current.untitled {
        let _ = std::fs::remove_dir_all(&current.root);
    }
    activate(&app, &state, &db, saved, &name).map(Some)
}

/// `D:\雜誌\春季號.magproj` → `D:\雜誌\春季號\` (the file itself is always `project.magproj`).
fn project_root_from_save_path(picked: &Path) -> AppResult<PathBuf> {
    let parent = picked.parent().ok_or_else(|| AppError::invalid_input("invalid save location"))?;
    let stem = if picked.extension().is_some_and(|ext| ext.eq_ignore_ascii_case(PROJECT_EXTENSION)) {
        picked.file_stem()
    } else {
        picked.file_name()
    };
    let name = stem.map(|s| s.to_string_lossy()).unwrap_or_default();
    Ok(parent.join(io::sanitize_folder_name(&name)?))
}

/// Stores an image (raw request body) in the current project.
///
/// # Returns
/// The project-relative path to use as `ImageElement.src`.
#[tauri::command]
pub async fn asset_import(state: State<'_, ProjectState>, request: Request<'_>) -> AppResult<String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid_input("expected a binary request body"));
    };
    let project = state.current()?;
    assets::import_bytes(&project.root, bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_path_becomes_project_folder() {
        let base = Path::new(r"D:\雜誌");
        assert_eq!(project_root_from_save_path(&base.join("春季號.magproj")).unwrap(), base.join("春季號"));
        assert_eq!(project_root_from_save_path(&base.join("春季號.MAGPROJ")).unwrap(), base.join("春季號"));
        assert_eq!(project_root_from_save_path(&base.join("v1.2")).unwrap(), base.join("v1.2"));
        assert_eq!(project_root_from_save_path(&base.join("con.magproj")).unwrap(), base.join("con_"));
    }
}
