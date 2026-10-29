//! Uploading flip books to a web-magazine server. All network calls happen here on the Rust side:
//! the token never reaches the WebView and the CSP stays closed.
//!
//! Contract: web-magazine `A01-Magazine-Server/docs/桌面上傳API.md` (this side reads only that).
//! Plan: `docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md`.

pub mod client;
pub mod package;
pub mod response;
pub mod server_url;

use crate::error::{AppError, AppResult};
use client::Session;
use response::UploadCode;
pub use response::UploadFailure;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use time::OffsetDateTime;

/// The logged-in account (only in memory: closing the app logs out), the HTTP client and the
/// upload in progress.
#[derive(Default)]
pub struct UploadState {
    /// Built on first use (loading the Windows certificate store takes a moment).
    client: OnceLock<reqwest::Client>,
    session: Mutex<Option<Session>>,
    /// One upload at a time (the server allows one per account anyway).
    busy: AtomicBool,
    /// Set by `upload_cancel`; shared with the upload stream.
    pub cancel: Arc<AtomicBool>,
    /// What `upload_open_reader` opens: the last upload's `readerUrl`.
    last_reader_url: Mutex<Option<String>>,
}

/// Marks an upload as running until dropped.
pub struct UploadRun<'a>(&'a AtomicBool);

impl Drop for UploadRun<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl UploadState {
    /// The shared HTTP client (cheap to clone: it is a handle).
    pub fn client(&self) -> AppResult<reqwest::Client> {
        if let Some(client) = self.client.get() {
            return Ok(client.clone());
        }
        let client = client::http_client()?;
        Ok(self.client.get_or_init(|| client).clone())
    }

    /// The session, if its token is still valid; an expired one is forgotten.
    pub fn current(&self) -> AppResult<Option<Session>> {
        let mut session = self.session.lock().map_err(|_| AppError::LockPoisoned)?;
        if session.as_ref().is_some_and(|session| !session.is_valid_at(OffsetDateTime::now_utc())) {
            *session = None;
        }
        Ok(session.clone())
    }

    /// The session for a call that needs a token.
    ///
    /// # Errors
    /// `UploadCode::Unauthenticated` when nobody is logged in or the token expired, without asking
    /// the server.
    pub fn require(&self) -> AppResult<Session> {
        self.current()?
            .ok_or_else(|| UploadFailure::new(UploadCode::Unauthenticated, "登入已過期，請重新輸入密碼").into())
    }

    /// Starts an upload: clears an old cancel request.
    ///
    /// # Errors
    /// `UploadCode::UploadInProgress` when another upload of this app is running.
    pub fn begin_upload(&self) -> AppResult<UploadRun<'_>> {
        if self.busy.swap(true, Ordering::SeqCst) {
            return Err(UploadFailure::new(UploadCode::UploadInProgress, "正在上傳另一本書，請等它完成").into());
        }
        self.cancel.store(false, Ordering::SeqCst);
        Ok(UploadRun(&self.busy))
    }

    pub fn last_reader_url(&self) -> AppResult<Option<String>> {
        Ok(self.last_reader_url.lock().map_err(|_| AppError::LockPoisoned)?.clone())
    }

    pub fn set_last_reader_url(&self, url: String) -> AppResult<()> {
        *self.last_reader_url.lock().map_err(|_| AppError::LockPoisoned)? = Some(url);
        Ok(())
    }

    pub fn set(&self, session: Option<Session>) -> AppResult<()> {
        *self.session.lock().map_err(|_| AppError::LockPoisoned)? = session;
        Ok(())
    }

    /// Passes a failed call's error through, forgetting the session when the server no longer
    /// accepts its token.
    pub fn check<T>(&self, result: Result<T, UploadFailure>) -> AppResult<T> {
        if let Err(failure) = &result {
            if failure.code == UploadCode::Unauthenticated {
                self.set(None)?;
            }
        }
        Ok(result?)
    }
}
