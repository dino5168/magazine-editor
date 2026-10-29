//! Upload commands: log in to a web-magazine server, pick or create the book, upload the flip
//! book. The token stays in `UploadState`; none of these commands returns it.

use super::export::ExportState;
use crate::error::{AppError, AppResult};
use crate::export::{cover, flipbook, ExportRequest};
use crate::project::ProjectState;
use crate::upload::client::{self, BookPage, SessionInfo, UploadBook, UploadControl, UploadedBook};
use crate::upload::response::UploadCode;
use crate::upload::server_url::{is_openable_reader_url, parse_server_url};
use crate::upload::{package, UploadFailure, UploadState};
use serde::Serialize;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_opener::OpenerExt;

/// Progress of `upload_flipbook`.
pub const PROGRESS_EVENT: &str = "upload://progress";
/// Report the upload at most every this many bytes (and at the end).
const PROGRESS_STEP_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UploadStage {
    /// Building the flip book, zip and cover.
    Building,
    /// Sending the zip (`sent` / `total` bytes).
    Uploading,
    /// Everything sent; the server is unpacking and checking it (cannot be cancelled any more).
    Processing,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
struct UploadProgress {
    stage: UploadStage,
    sent: u64,
    total: u64,
}

fn emit(app: &AppHandle, stage: UploadStage, sent: u64, total: u64) {
    let _ = app.emit(PROGRESS_EVENT, UploadProgress { stage, sent, total });
}

/// What `upload_flipbook` reports.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadResult {
    #[serde(flatten)]
    pub book: UploadedBook,
    /// False when the cover could not be drawn (the book keeps its old cover).
    pub cover_uploaded: bool,
    pub skipped_images: usize,
}

/// Logs in (replacing any earlier session). The password is used for this one request only.
///
/// # Errors
/// `AppError::InvalidInput` for an address that is not allowed, `AppError::Upload` when the
/// server refuses (`unauthenticated` = wrong email or password).
#[tauri::command]
pub async fn upload_login(state: State<'_, UploadState>, server: String, email: String, password: String) -> AppResult<SessionInfo> {
    let server = parse_server_url(&server)?;
    if email.trim().is_empty() || password.is_empty() {
        return Err(UploadFailure::new(UploadCode::Unauthenticated, "請輸入 email 與密碼").into());
    }
    // 換帳號或換伺服器：先登出，登入失敗也不留著舊的
    state.set(None)?;
    let client = state.client()?;
    let session = client::login(&client, server, &email, &password).await?;
    let info = session.info();
    state.set(Some(session))?;
    Ok(info)
}

/// Forgets the token.
#[tauri::command]
pub fn upload_logout(state: State<'_, UploadState>) -> AppResult<()> {
    state.set(None)
}

/// The current session, or null when not logged in or the token expired.
#[tauri::command]
pub fn upload_session(state: State<'_, UploadState>) -> AppResult<Option<SessionInfo>> {
    Ok(state.current()?.map(|session| session.info()))
}

/// One page (50) of the books the account may overwrite, newest first.
///
/// # Args
/// * `after` - `nextCursor` of the previous page; null for the first.
#[tauri::command]
pub async fn upload_list_books(state: State<'_, UploadState>, after: Option<String>) -> AppResult<BookPage> {
    let session = state.require()?;
    let client = state.client()?;
    state.check(client::my_books(&client, &session, after.as_deref()).await)
}

/// Creates a draft book.
///
/// # Errors
/// `AppError::Upload` with `forbidden` for an ADMIN account (it belongs to no publisher),
/// `badInput` for an empty or too long title.
#[tauri::command]
pub async fn upload_create_book(state: State<'_, UploadState>, title: String) -> AppResult<UploadBook> {
    let session = state.require()?;
    if !session.can_create_books() {
        return Err(UploadFailure::new(UploadCode::Forbidden, "系統管理者（ADMIN）不屬於出版社，不能新建書，請選擇既有的書").into());
    }
    let client = state.client()?;
    state.check(client::create_book(&client, &session, &title).await)
}

/// Builds the flip book of the current content (like the zip export), checks it against the
/// server's limits and uploads it with a cover of the first page. Progress comes as
/// `upload://progress` events.
///
/// # Args
/// * `book_id` - From `upload_list_books` / `upload_create_book`.
/// * `request` - The same request as `export_flipbook_zip`.
///
/// # Returns
/// The result, or null when cancelled before everything was sent.
///
/// # Errors
/// `AppError::Upload` (`unauthenticated` when the login expired: log in and call again),
/// `AppError::Export` / `InvalidInput` when the book cannot be built.
#[tauri::command]
pub async fn upload_flipbook(
    app: AppHandle,
    state: State<'_, UploadState>,
    project: State<'_, ProjectState>,
    exports: State<'_, ExportState>,
    book_id: String,
    request: ExportRequest,
) -> AppResult<Option<UploadResult>> {
    if !client::is_valid_book_id(&book_id) {
        return Err(AppError::invalid_input("書本 id 不正確"));
    }
    state.require()?;
    let _run = state.begin_upload()?;
    let root = project.current()?.root;
    let fonts = exports.fonts();

    emit(&app, UploadStage::Building, 0, 0);
    // 排版、壓縮、畫封面都是 CPU 密集工作
    let built = tauri::async_runtime::spawn_blocking(move || -> AppResult<_> {
        let output = flipbook::build_flipbook(&root, &request)?;
        let zip = package::prepare(&output.files)?;
        // 封面失敗不擋上傳：網站保留原本的封面
        let cover = cover::render_cover(&root, request, fonts.to_vec()).ok().flatten();
        Ok((zip, cover, output.skipped_images))
    })
    .await
    .map_err(|error| AppError::Export(format!("準備上傳中斷：{error}")))??;
    let (zip, cover, skipped_images) = built;
    if state.cancel.load(Ordering::SeqCst) {
        return Ok(None);
    }

    // 排版可能花了一點時間：送出 100 MB 之前再確認一次登入還有效
    let session = state.require()?;
    let client = state.client()?;
    let cover_uploaded = cover.is_some();
    let reported = AtomicU64::new(0);
    let progress_app = app.clone();
    let control = UploadControl {
        cancel: Arc::clone(&state.cancel),
        on_sent: Arc::new(move |sent, total| {
            if sent - reported.load(Ordering::SeqCst) >= PROGRESS_STEP_BYTES || sent == total {
                reported.store(sent, Ordering::SeqCst);
                emit(&progress_app, UploadStage::Uploading, sent, total);
                if sent == total {
                    emit(&progress_app, UploadStage::Processing, sent, total);
                }
            }
        }),
    };
    let Some(book) = state.check(client::upload_package(&client, &session, &book_id, zip, cover, &control).await)? else {
        return Ok(None);
    };
    state.set_last_reader_url(book.reader_url.clone())?;
    Ok(Some(UploadResult { book, cover_uploaded, skipped_images }))
}

/// Stops the upload in progress (no effect once every byte is sent); `upload_flipbook` then
/// resolves to null.
#[tauri::command]
pub fn upload_cancel(state: State<'_, UploadState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// Opens the last uploaded book in the browser. The URL never comes from the WebView.
#[tauri::command]
pub async fn upload_open_reader(app: AppHandle, state: State<'_, UploadState>) -> AppResult<()> {
    let url = state
        .last_reader_url()?
        .filter(|url| is_openable_reader_url(url))
        .ok_or_else(|| AppError::invalid_input("還沒有上傳過翻頁書"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|error| AppError::invalid_input(format!("無法開啟瀏覽器：{error}")))
}
