//! Upload commands: log in to a web-magazine server and pick or create the book to upload to.
//! The token stays in `UploadState`; none of these commands returns it.

use crate::error::AppResult;
use crate::upload::client::{self, BookPage, SessionInfo, UploadBook};
use crate::upload::response::UploadCode;
use crate::upload::server_url::parse_server_url;
use crate::upload::{UploadFailure, UploadState};
use tauri::State;

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
