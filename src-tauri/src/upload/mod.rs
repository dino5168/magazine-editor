//! Uploading flip books to a web-magazine server. All network calls happen here on the Rust side:
//! the token never reaches the WebView and the CSP stays closed.
//!
//! Contract: web-magazine `A01-Magazine-Server/docs/桌面上傳API.md` (this side reads only that).
//! Plan: `docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md`.

// 步驟 1 只有純函式；步驟 2 接上 command 後移除
#![allow(dead_code)]

pub mod response;
pub mod server_url;

pub use response::UploadFailure;
