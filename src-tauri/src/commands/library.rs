//! Asset library commands. The library is written immediately after every change, outside the
//! project's save / undo cycle.

use crate::error::{AppError, AppResult};
use crate::project::assets::{self, AssetKind};
use crate::project::thumbnails;
use crate::project::library::{self, Library};
use crate::project::ProjectState;
use tauri::http::HeaderMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::State;

/// Request header naming what `library_import` receives: `image`, `text` or `audio`.
const KIND_HEADER: &str = "x-asset-kind";
/// Request header with a text file's extension (`txt` / `md`); text has no magic bytes.
const EXTENSION_HEADER: &str = "x-asset-extension";

/// Writes the current project's `library.json`.
///
/// # Args
/// * `project_id` - The project the library belongs to. A write that arrives after the user has
///   switched projects is refused, so one project's library never lands in another.
///
/// # Errors
/// `AppError::InvalidInput` when `project_id` is not the current project, `AppError::InvalidProject`
/// for an invalid library, `AppError::Io` on write failure.
#[tauri::command]
pub async fn library_write(state: State<'_, ProjectState>, project_id: String, library: Library) -> AppResult<()> {
    let project = state.current()?;
    check_project(&project.id, &project_id)?;
    library::write(&project.root, &library)
}

fn check_project(current: &str, requested: &str) -> AppResult<()> {
    if current != requested {
        return Err(AppError::invalid_input("素材庫屬於另一個專案，這次的變更沒有寫入"));
    }
    Ok(())
}

fn header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers.get(name).and_then(|value| value.to_str().ok())
}

/// Reads the asset kind from the request headers.
fn asset_kind(headers: &HeaderMap) -> AppResult<AssetKind<'_>> {
    match header(headers, KIND_HEADER) {
        Some("image") => Ok(AssetKind::Image),
        Some("audio") => Ok(AssetKind::Audio),
        Some("text") => Ok(AssetKind::Text { extension: header(headers, EXTENSION_HEADER).unwrap_or_default() }),
        _ => Err(AppError::invalid_input("不支援的素材種類")),
    }
}

/// Stores a file (raw request body) in the current project's asset directories.
/// The kind comes from the `x-asset-kind` header (and `x-asset-extension` for text).
///
/// # Returns
/// The project-relative path for the library item's `src`.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for an unknown kind or unacceptable content.
#[tauri::command]
pub async fn library_import(state: State<'_, ProjectState>, request: Request<'_>) -> AppResult<String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::invalid_input("素材資料格式不正確"));
    };
    let kind = asset_kind(request.headers())?;
    let project = state.current()?;
    assets::import_asset(&project.root, bytes, kind)
}

/// Returns the thumbnail of a library image, making it first when needed (decoding a large photo
/// takes a while, so this runs on a blocking thread).
///
/// # Returns
/// The thumbnail's project-relative path, or `None` when the original should be shown as is.
///
/// # Errors
/// See `thumbnails::ensure`; the frontend then shows the original.
#[tauri::command]
pub async fn library_thumbnail(state: State<'_, ProjectState>, src: String) -> AppResult<Option<String>> {
    let root = state.current()?.root;
    tauri::async_runtime::spawn_blocking(move || thumbnails::ensure(&root, &src))
        .await
        .map_err(|error| AppError::invalid_input(format!("縮圖中斷：{error}")))?
}

/// Reads a text asset of the current project in full, for placing it on a page.
///
/// # Errors
/// See `assets::read_text`.
#[tauri::command]
pub async fn library_read_text(state: State<'_, ProjectState>, src: String) -> AppResult<String> {
    assets::read_text(&state.current()?.root, &src)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::http::HeaderValue;

    #[test]
    fn write_must_target_the_current_project() {
        assert!(check_project("a", "a").is_ok());
        assert!(matches!(check_project("a", "b"), Err(AppError::InvalidInput(_))));
    }

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        let mut map = HeaderMap::new();
        for (name, value) in pairs {
            map.insert(*name, HeaderValue::from_static(value));
        }
        map
    }

    #[test]
    fn kind_comes_from_headers() {
        assert_eq!(asset_kind(&headers(&[(KIND_HEADER, "image")])).unwrap(), AssetKind::Image);
        assert_eq!(asset_kind(&headers(&[(KIND_HEADER, "audio")])).unwrap(), AssetKind::Audio);
        assert_eq!(
            asset_kind(&headers(&[(KIND_HEADER, "text"), (EXTENSION_HEADER, "md")])).unwrap(),
            AssetKind::Text { extension: "md" }
        );
        // 文字沒帶副檔名 → 空字串，由 import_asset 拒絕
        assert_eq!(asset_kind(&headers(&[(KIND_HEADER, "text")])).unwrap(), AssetKind::Text { extension: "" });
        assert!(asset_kind(&headers(&[(KIND_HEADER, "video")])).is_err());
        assert!(asset_kind(&headers(&[])).is_err());
    }
}
