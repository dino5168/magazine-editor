//! Video links (`MediaElement`, multimedia plan `docs/15-Pland-Mp4/1-加入hyperlink-Mp4-實作.md`):
//! what YouTube says about a video id — its thumbnail (stored as the poster) and title.
//!
//! Only fixed YouTube URLs built from a validated id are requested; nothing from the WebView becomes
//! part of a URL. Failures are not errors: the element works without poster or title (step 3).

use crate::error::{AppError, AppResult};
use crate::project::assets::{self, AssetKind};
use crate::project::format::{is_youtube_video_id, MEDIA_TITLE_MAX_CHARS};
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::Path;
use std::time::Duration;

/// Largest thumbnail accepted (`hqdefault.jpg` is about 20–40 KB).
const THUMBNAIL_MAX_BYTES: usize = 2 * 1024 * 1024;
/// Largest oEmbed answer accepted (a few hundred bytes in practice).
const OEMBED_MAX_BYTES: usize = 64 * 1024;
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(20);

/// The 480 × 360 thumbnail every video has (4:3 with letterbox bars for 16:9 videos; the editor
/// crops them with `cover`). `maxresdefault` is missing for many videos.
pub fn thumbnail_url(video_id: &str) -> String {
    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
}

/// The canonical watch URL the exports link to; same as `youTubeWatchUrl` in
/// `src/lib/media/youtube-url.ts` (start 0 leaves `t` out).
pub fn youtube_watch_url(video_id: &str, start: u32) -> String {
    let base = format!("https://www.youtube.com/watch?v={video_id}");
    if start > 0 { format!("{base}&t={start}s") } else { base }
}

/// Host of the in-book player: YouTube's privacy-enhanced domain (no cookies until playback).
/// The flip book's CSP allows frames from exactly this origin.
pub const YOUTUBE_EMBED_ORIGIN: &str = "https://www.youtube-nocookie.com";

/// The player URL the flip book opens over the book: starts playing (the reader clicked play),
/// no related videos from other channels at the end, from `start` seconds.
pub fn youtube_embed_url(video_id: &str, start: u32) -> String {
    let base = format!("{YOUTUBE_EMBED_ORIGIN}/embed/{video_id}?autoplay=1&rel=0");
    if start > 0 { format!("{base}&start={start}") } else { base }
}

/// YouTube's oEmbed endpoint for the video: its title, and whether it may be embedded.
pub fn oembed_url(video_id: &str) -> String {
    // id 只含 [A-Za-z0-9_-]，放進 query 不必另外編碼；外層網址的 : / ? = 要編碼
    format!("https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D{video_id}")
}

/// Whether the video can be played inside the flip book, from the oEmbed answer.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Availability {
    /// Public and embeddable.
    Ok,
    /// Exists, but the owner turned embedding off (or it is private): only the link works.
    NotEmbeddable,
    /// No such video (deleted or a mistyped id).
    NotFound,
    /// No answer (offline, timeout, unexpected reply).
    Unknown,
}

impl Availability {
    /// Reads the oEmbed HTTP status: 200 ok, 401 / 403 not embeddable or private, 400 / 404 not found.
    pub fn from_oembed_status(status: u16) -> Self {
        match status {
            200 => Self::Ok,
            401 | 403 => Self::NotEmbeddable,
            400 | 404 => Self::NotFound,
            _ => Self::Unknown,
        }
    }
}

/// A stored poster: `ShapeImage.src` and the intrinsic size the editor needs to place it.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Poster {
    pub src: String,
    pub width: u32,
    pub height: u32,
}

/// What the insert dialog shows before adding the video.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct YouTubeInfo {
    /// None when the thumbnail could not be fetched or used.
    pub poster: Option<Poster>,
    /// None when oEmbed gave no usable title.
    pub title: Option<String>,
    pub availability: Availability,
}

#[derive(Deserialize)]
struct OEmbed {
    title: Option<String>,
}

/// The title in an oEmbed answer: control characters dropped, spaces trimmed, cut to
/// `MEDIA_TITLE_MAX_CHARS` characters (the file format's limit). None when missing or empty.
pub fn oembed_title(json: &[u8]) -> Option<String> {
    let title = serde_json::from_slice::<OEmbed>(json).ok()?.title?;
    let cleaned: String = title.chars().filter(|c| !c.is_control()).collect();
    let trimmed: String = cleaned.trim().chars().take(MEDIA_TITLE_MAX_CHARS).collect();
    let trimmed = trimmed.trim_end().to_owned();
    (!trimmed.is_empty()).then_some(trimmed)
}

/// Stores a downloaded thumbnail as a project image (same path and dedupe as imported images).
///
/// # Errors
/// `AppError::InvalidInput` when the bytes are not a PNG / JPEG / WebP that can be decoded (YouTube
/// answers with a tiny placeholder or HTML on some errors), `AppError::Io` on write failure.
pub fn store_poster(root: &Path, bytes: &[u8]) -> AppResult<Poster> {
    if bytes.len() > THUMBNAIL_MAX_BYTES || !matches!(assets::detect_extension(bytes), Some("jpg" | "png" | "webp")) {
        return Err(AppError::invalid_input("影片縮圖不是可用的圖片"));
    }
    let (width, height) = image::ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .ok()
        .and_then(|reader| reader.into_dimensions().ok())
        .ok_or_else(|| AppError::invalid_input("影片縮圖不是可用的圖片"))?;
    let src = assets::import_asset(root, bytes, AssetKind::Image)?;
    Ok(Poster { src, width, height })
}

fn client() -> Option<reqwest::Client> {
    reqwest::Client::builder()
        .user_agent(concat!("magazine-editor/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(CONNECT_TIMEOUT)
        .timeout(REQUEST_TIMEOUT)
        // 只連固定的 YouTube 網址；轉址到別處不跟
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .ok()
}

/// GETs `url`, reading at most `max` bytes. Returns the status and body, or None on network failure
/// or an oversized body.
async fn fetch(client: &reqwest::Client, url: &str, max: usize) -> Option<(u16, Vec<u8>)> {
    let mut response = client.get(url).send().await.ok()?;
    let status = response.status().as_u16();
    if response.content_length().is_some_and(|length| length > max as u64) {
        return None;
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.ok()? {
        body.extend_from_slice(&chunk);
        if body.len() > max {
            return None;
        }
    }
    Some((status, body))
}

/// Fetches the thumbnail (stored into the project at `root`) and the title of a YouTube video, both
/// at once. Network failures leave the fields empty instead of failing.
///
/// # Errors
/// `AppError::InvalidInput` (user-facing) for an id that is not a YouTube video id.
pub async fn youtube_info(root: &Path, video_id: &str) -> AppResult<YouTubeInfo> {
    if !is_youtube_video_id(video_id) {
        return Err(AppError::invalid_input("不是 YouTube 影片的編號"));
    }
    let Some(client) = client() else {
        return Ok(YouTubeInfo { poster: None, title: None, availability: Availability::Unknown });
    };
    let (thumbnail_url, oembed_url) = (thumbnail_url(video_id), oembed_url(video_id));
    let (thumbnail, oembed) =
        tokio::join!(fetch(&client, &thumbnail_url, THUMBNAIL_MAX_BYTES), fetch(&client, &oembed_url, OEMBED_MAX_BYTES));
    let (availability, title) = match oembed {
        Some((status, body)) => {
            let availability = Availability::from_oembed_status(status);
            (availability, if availability == Availability::Ok { oembed_title(&body) } else { None })
        }
        None => (Availability::Unknown, None),
    };
    // 不存在的影片 i.ytimg.com 回 404 加一張灰色小圖：只收 200
    let poster = match thumbnail {
        Some((200, bytes)) => {
            let root = root.to_owned();
            // 解碼與寫檔不佔 async runtime
            tauri::async_runtime::spawn_blocking(move || store_poster(&root, &bytes).ok()).await.ok().flatten()
        }
        _ => None,
    };
    Ok(YouTubeInfo { poster, title, availability })
}

#[cfg(test)]
mod tests;
