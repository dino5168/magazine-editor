//! Project fonts (`document.fonts`, files in `assets/fonts/`).

use crate::error::{AppError, AppResult};
use crate::project::format::FontFile;
use crate::project::font_catalog::{self, CatalogFile, CatalogFont};
use crate::project::fonts::{self, CollectionFace};
use crate::project::system_fonts::{self, SystemFont, SystemFontsState};
use crate::project::ProjectState;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::http::HeaderMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, State};

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

/// The catalog download in progress (one at a time) and its cancel flag.
#[derive(Debug, Default)]
pub struct FontDownloadState {
    busy: AtomicBool,
    cancel: AtomicBool,
}

/// Clears `busy` however the download ends.
struct BusyGuard<'a>(&'a AtomicBool);

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

/// Event with the download progress (bytes of all the files this download needs).
const PROGRESS_EVENT: &str = "font-catalog://progress";
/// Progress is sent at most once per this many bytes (and at the end).
const PROGRESS_STEP_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress<'a> {
    id: &'a str,
    received: u64,
    total: u64,
}

/// A user-facing download error, with where to get the font by hand.
fn download_failed(font: &CatalogFont, reason: &str) -> AppError {
    AppError::invalid_input(format!("無法下載「{}」：{reason}。可以到 {} 手動下載，再用「匯入字型檔...」加入。", font.name, font.homepage))
}

fn network_reason(error: &reqwest::Error) -> String {
    if error.is_timeout() {
        "連線逾時".to_owned()
    } else if let Some(status) = error.status() {
        format!("伺服器回應 {}", status.as_u16())
    } else if error.is_connect() {
        "連不上網路或伺服器".to_owned()
    } else {
        "下載中斷".to_owned()
    }
}

/// Downloads one file of the catalog.
///
/// # Returns
/// The bytes, or None when the user cancelled; `Err` is the reason (Chinese).
async fn download(client: &reqwest::Client, file: &CatalogFile, cancel: &AtomicBool, progress: &mut (dyn FnMut(u64) + Send)) -> Result<Option<Vec<u8>>, String> {
    let mut response = client.get(&file.url).send().await.and_then(reqwest::Response::error_for_status).map_err(|error| network_reason(&error))?;
    let mut bytes = Vec::with_capacity(usize::try_from(file.bytes).unwrap_or_default());
    while let Some(chunk) = response.chunk().await.map_err(|error| network_reason(&error))? {
        if cancel.load(Ordering::SeqCst) {
            return Ok(None);
        }
        bytes.extend_from_slice(&chunk);
        // 清單寫了大小：多出來就不用再收
        if bytes.len() as u64 > file.bytes {
            return Err("檔案大小和清單不符".to_owned());
        }
        progress(chunk.len() as u64);
    }
    Ok(Some(bytes))
}

/// Ids of the catalog fonts already in the local cache (adding them needs no download).
///
/// # Errors
/// `AppError::Tauri` when the app data folder cannot be found.
#[tauri::command]
pub fn font_catalog_cached(app: AppHandle) -> AppResult<Vec<String>> {
    Ok(font_catalog::cached_ids(&font_catalog::cache_dir(&app.path().app_local_data_dir()?)))
}

/// Stops the download in progress; `font_catalog_download` then resolves to null.
#[tauri::command]
pub fn font_catalog_cancel(state: State<'_, FontDownloadState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// Adds a font of the built-in catalog to the current project: its files come from the local
/// cache, or are downloaded (only from the catalog's pinned URLs, progress as
/// `font-catalog://progress` events), checked against the catalog's SHA-256 and cached.
///
/// # Returns
/// The stored files, or null when cancelled.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for an unknown id, another download in progress, a
/// network failure or a download that does not match the catalog.
#[tauri::command]
pub async fn font_catalog_download(
    app: AppHandle,
    state: State<'_, FontDownloadState>,
    project: State<'_, ProjectState>,
    id: String,
) -> AppResult<Option<ImportedFonts>> {
    let font = font_catalog::find(&id)?;
    let root = project.current()?.root;
    if state.busy.swap(true, Ordering::SeqCst) {
        return Err(AppError::invalid_input("正在下載另一套字型，請等它完成"));
    }
    let _busy = BusyGuard(&state.busy);
    state.cancel.store(false, Ordering::SeqCst);
    let cache = font_catalog::cache_dir(&app.path().app_local_data_dir()?);

    let missing = font_catalog::missing_downloads(font, &cache);
    let total: u64 = missing.iter().map(|file| file.bytes).sum();
    let mut downloads = HashMap::new();
    if !missing.is_empty() {
        let client = reqwest::Client::builder()
            .user_agent(concat!("magazine-editor/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(30))
            .read_timeout(Duration::from_secs(60))
            .build()
            .map_err(|error| download_failed(font, &network_reason(&error)))?;
        let (mut received, mut reported) = (0u64, 0u64);
        let mut progress = |bytes: u64| {
            received += bytes;
            if received - reported >= PROGRESS_STEP_BYTES || received == total {
                reported = received;
                let _ = app.emit(PROGRESS_EVENT, DownloadProgress { id: &font.id, received, total });
            }
        };
        for file in missing {
            match download(&client, file, &state.cancel, &mut progress).await {
                Ok(Some(bytes)) => {
                    downloads.insert(file.url.clone(), bytes);
                }
                Ok(None) => return Ok(None),
                Err(reason) => return Err(download_failed(font, &reason)),
            }
        }
    }

    // 驗證、解壓、寫快取、檢查字型都要一點時間（中文字型 10–60 MB），不佔 async runtime
    tauri::async_runtime::spawn_blocking(move || {
        let (regular, bold) = font_catalog::font_files(font, &cache, &downloads).map_err(|error| match error {
            AppError::InvalidInput(message) => download_failed(font, &message),
            other => other,
        })?;
        Ok(Some(ImportedFonts {
            regular: fonts::import_font(&root, &regular, None)?,
            bold: bold.map(|bytes| fonts::import_font(&root, &bytes, None)).transpose()?,
        }))
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

    /// Manual check over the network (font plan step 9): `cargo test catalog_download_over_the_network
    /// -- --ignored --nocapture` downloads the smallest catalog font, checks it into a temporary
    /// cache and imports it; then a cancelled download returns None.
    #[test]
    #[ignore]
    fn catalog_download_over_the_network() {
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        let font = font_catalog::catalog().iter().min_by_key(|font| font.regular.bytes).unwrap();
        let client = reqwest::Client::builder().user_agent("magazine-editor-test").build().unwrap();
        let cancel = AtomicBool::new(false);
        let mut received = 0u64;
        let started = std::time::Instant::now();
        let bytes = runtime
            .block_on(download(&client, &font.regular, &cancel, &mut |n| received += n))
            .unwrap()
            .unwrap();
        println!("{}: {} bytes in {:?}", font.id, bytes.len(), started.elapsed());
        assert_eq!(received, font.regular.bytes);

        let dir = tempfile::tempdir().unwrap();
        let cache = font_catalog::cache_dir(dir.path());
        let downloads = HashMap::from([(font.regular.url.clone(), bytes)]);
        let (regular, _) = font_catalog::font_files(font, &cache, &downloads).unwrap();
        let file = fonts::import_font(dir.path(), &regular, None).unwrap();
        println!("{} / {} -> {}", file.file_family, file.file_style, file.src);
        assert!(font_catalog::missing_downloads(font, &cache).is_empty());

        cancel.store(true, Ordering::SeqCst);
        assert_eq!(runtime.block_on(download(&client, &font.regular, &cancel, &mut |_| {})).unwrap(), None);
        // 不存在的網址：錯誤原因是中文
        let missing = CatalogFile { url: format!("{}.missing", font.regular.url), ..font.regular.clone() };
        cancel.store(false, Ordering::SeqCst);
        let reason = runtime.block_on(download(&client, &missing, &cancel, &mut |_| {})).unwrap_err();
        println!("missing url: {reason}");
        assert!(reason.contains("404"), "{reason}");
    }
}
