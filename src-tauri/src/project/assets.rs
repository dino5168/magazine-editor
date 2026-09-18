//! Importing image files into `assets/images/`.

use super::format::ASSET_DIR;
use super::io::asset_dir;
use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::fs;
use std::path::Path;

/// Same limit as the frontend upload validation.
pub const MAX_ASSET_BYTES: usize = 20 * 1024 * 1024;
/// Hex characters of the SHA-256 digest used as the file name (128 bits is ample for dedupe).
const HASH_HEX_LEN: usize = 32;
const SVG_SNIFF_BYTES: usize = 4096;

/// Detects the image format from magic bytes; the file name / MIME from the WebView is not trusted.
///
/// SVG is accepted because the bundled sample photos are SVG. It is only ever rendered through
/// `<img>` / canvas, where scripts inside the SVG do not run.
pub fn detect_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("png");
    }
    if bytes.starts_with(b"\xFF\xD8\xFF") {
        return Some("jpg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("gif");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(SVG_SNIFF_BYTES)]);
    let head = head.trim_start_matches('\u{feff}').trim_start();
    if head.starts_with('<') && head.contains("<svg") {
        return Some("svg");
    }
    None
}

fn content_hash(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut hex = String::with_capacity(HASH_HEX_LEN);
    for byte in &digest[..HASH_HEX_LEN / 2] {
        let _ = write!(hex, "{byte:02x}");
    }
    hex
}

/// Stores an image in the project, named by content hash so identical images are stored once.
/// Existing files are never rewritten, which keeps undo history and backups valid.
///
/// # Returns
/// The project-relative path, e.g. `assets/images/<hash>.png`.
///
/// # Errors
/// Returns `AppError::InvalidInput` for empty, oversized or unsupported data, `AppError::Io` on
/// write failure.
pub fn import_bytes(root: &Path, bytes: &[u8]) -> AppResult<String> {
    if bytes.is_empty() {
        return Err(AppError::invalid_input("圖片檔案是空的"));
    }
    if bytes.len() > MAX_ASSET_BYTES {
        return Err(AppError::invalid_input("圖片超過 20 MB 上限"));
    }
    let extension = detect_extension(bytes).ok_or_else(|| AppError::invalid_input("不是支援的圖片格式"))?;
    let file_name = format!("{}.{extension}", content_hash(bytes));
    let dir = asset_dir(root);
    fs::create_dir_all(&dir)?;
    let target = dir.join(&file_name);
    if !target.exists() {
        let tmp = dir.join(format!("{file_name}.tmp"));
        fs::write(&tmp, bytes)?;
        fs::rename(&tmp, &target)?;
    }
    Ok(format!("{ASSET_DIR}/{file_name}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    #[test]
    fn detects_supported_formats() {
        assert_eq!(detect_extension(PNG), Some("png"));
        assert_eq!(detect_extension(b"\xFF\xD8\xFF\xE0rest"), Some("jpg"));
        assert_eq!(detect_extension(b"GIF89a...."), Some("gif"));
        assert_eq!(detect_extension(b"RIFF\0\0\0\0WEBPVP8 "), Some("webp"));
        assert_eq!(detect_extension(b"\xEF\xBB\xBF  <?xml version=\"1.0\"?>\n<svg xmlns=\"\">"), Some("svg"));
        assert_eq!(detect_extension(b"<svg viewBox=\"0 0 1 1\"/>"), Some("svg"));
        assert_eq!(detect_extension(b"MZ\x90\0 executable"), None);
        assert_eq!(detect_extension(b"<html><body>"), None);
        assert_eq!(detect_extension(b""), None);
    }

    #[test]
    fn import_dedupes_by_content() {
        let dir = tempfile::tempdir().unwrap();
        let first = import_bytes(dir.path(), PNG).unwrap();
        let second = import_bytes(dir.path(), PNG).unwrap();
        assert_eq!(first, second);
        assert!(first.starts_with("assets/images/") && first.ends_with(".png"));
        assert_eq!(first.len(), "assets/images/".len() + HASH_HEX_LEN + ".png".len());
        assert_eq!(fs::read_dir(asset_dir(dir.path())).unwrap().count(), 1);
    }

    #[test]
    fn import_rejects_bad_input() {
        let dir = tempfile::tempdir().unwrap();
        assert!(import_bytes(dir.path(), b"").is_err());
        assert!(import_bytes(dir.path(), b"not an image").is_err());
        let mut big = PNG.to_vec();
        big.resize(MAX_ASSET_BYTES + 1, 0);
        assert!(import_bytes(dir.path(), &big).is_err());
    }
}
