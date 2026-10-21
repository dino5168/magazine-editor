//! Project fonts (`document.fonts`, files in `assets/fonts/`).

use crate::error::{AppError, AppResult};
use crate::project::format::FontFile;
use crate::project::fonts::{self, CollectionFace};
use crate::project::system_fonts::{self, SystemFont, SystemFontsState};
use crate::project::ProjectState;
use serde::Serialize;
use tauri::http::HeaderMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Manager, State};

/// Request header with the face of a font collection (`.ttc`) to import, 0-based.
const INDEX_HEADER: &str = "x-font-index";

/// The face index from the request headers; absent = a single font.
fn face_index(headers: &HeaderMap) -> AppResult<Option<u32>> {
    let Some(value) = headers.get(INDEX_HEADER) else { return Ok(None) };
    value
        .to_str()
        .ok()
        .and_then(|text| text.parse::<u32>().ok())
        .map(Some)
        .ok_or_else(|| AppError::invalid_input("字型集合的編號不正確"))
}

fn raw_body(request: &Request<'_>) -> AppResult<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(bytes) => Ok(bytes.clone()),
        _ => Err(AppError::invalid_input("字型資料格式不正確")),
    }
}

/// Imports a font file into the current project (raw body: the file's bytes; header
/// `x-font-index` picks the face of a `.ttc`).
///
/// # Returns
/// What to store as `ProjectFont.regular` / `bold`. The font list itself is document content and
/// changes through the editor (undoable), so nothing else is written here.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for a file that cannot be used (see `fonts::prepare` and
/// `fonts::analyze`).
#[tauri::command]
pub async fn font_import(state: State<'_, ProjectState>, request: Request<'_>) -> AppResult<FontFile> {
    let bytes = raw_body(&request)?;
    let index = face_index(request.headers())?;
    let root = state.current()?.root;
    // 中文字型 10–30 MB：算雜湊、交給 Typst 檢查都要一點時間，不佔 async runtime
    tauri::async_runtime::spawn_blocking(move || fonts::import_font(&root, &bytes, index))
        .await
        .map_err(|error| AppError::invalid_input(format!("匯入字型中斷：{error}")))?
}

/// Lists the faces of a font collection (raw body: the `.ttc` file), so the user can choose one.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) when it is not a readable collection.
#[tauri::command]
pub async fn font_collection_faces(request: Request<'_>) -> AppResult<Vec<CollectionFace>> {
    let bytes = raw_body(&request)?;
    tauri::async_runtime::spawn_blocking(move || fonts::collection_faces(&bytes))
        .await
        .map_err(|error| AppError::invalid_input(format!("讀取字型集合中斷：{error}")))?
}

/// The fonts installed on this computer (system and per-user), each with an opaque id.
///
/// # Errors
/// `AppError::Tauri` when the app data folder cannot be found.
#[tauri::command]
pub async fn system_fonts_list(app: AppHandle, state: State<'_, SystemFontsState>) -> AppResult<Vec<SystemFont>> {
    let local = app.path().app_local_data_dir()?;
    std::fs::create_dir_all(&local)?;
    let (fonts, locations) =
        tauri::async_runtime::spawn_blocking(move || system_fonts::list(&system_fonts::font_folders(), &system_fonts::cache_file(&local)))
            .await
            .map_err(|error| AppError::invalid_input(format!("讀取系統字型中斷：{error}")))?;
    *state.0.lock().map_err(|_| AppError::LockPoisoned)? = locations;
    Ok(fonts)
}

/// The regular (and optional bold) file of a project font added from the system list.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportedFonts {
    pub regular: FontFile,
    pub bold: Option<FontFile>,
}

/// Adds system fonts (ids from `system_fonts_list`) to the current project: a face of a collection
/// becomes a single font, then the usual import checks run.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for an unknown id, a missing file or an unusable font.
#[tauri::command]
pub async fn font_import_system(
    state: State<'_, SystemFontsState>,
    project: State<'_, ProjectState>,
    regular: String,
    bold: Option<String>,
) -> AppResult<ImportedFonts> {
    let locations = state.0.lock().map_err(|_| AppError::LockPoisoned)?.clone();
    let root = project.current()?.root;
    tauri::async_runtime::spawn_blocking(move || {
        let folders = system_fonts::font_folders();
        let import = |id: &str| -> AppResult<FontFile> {
            let (bytes, index) = system_fonts::read_listed(&locations, &folders, id)?;
            fonts::import_font(&root, &bytes, Some(index))
        };
        Ok(ImportedFonts { regular: import(&regular)?, bold: bold.as_deref().map(import).transpose()? })
    })
    .await
    .map_err(|error| AppError::invalid_input(format!("加入字型中斷：{error}")))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::http::HeaderValue;

    fn headers(value: Option<&str>) -> HeaderMap {
        let mut map = HeaderMap::new();
        if let Some(value) = value {
            map.insert(INDEX_HEADER, HeaderValue::from_str(value).unwrap());
        }
        map
    }

    #[test]
    fn face_index_comes_from_the_header() {
        assert_eq!(face_index(&headers(None)).unwrap(), None);
        assert_eq!(face_index(&headers(Some("2"))).unwrap(), Some(2));
        for bad in ["-1", "x", ""] {
            assert!(face_index(&headers(Some(bad))).is_err(), "{bad}");
        }
    }
}
