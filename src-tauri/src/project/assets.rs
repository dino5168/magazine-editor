//! Importing files into the asset directories: images (`assets/images/`), and the asset library's
//! text (`assets/texts/`) and audio (`assets/audio/`) files.

use super::format::{self, ASSET_DIR, AUDIO_ASSET_DIR, TEXT_ASSET_DIR};
use crate::error::{AppError, AppResult};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;

/// Same limit as the frontend upload validation.
const MAX_ASSET_BYTES: usize = 20 * 1024 * 1024;
/// Text assets are placed on a page as one text element; larger files make the canvas slow.
/// Same as `TEXT_ASSET_MAX_BYTES` in `src/lib/library/types.ts`.
pub const TEXT_ASSET_MAX_BYTES: usize = 200 * 1024;
/// Audio files are only stored, never decoded, so they may be larger than images.
pub const AUDIO_ASSET_MAX_BYTES: usize = 50 * 1024 * 1024;
const UTF8_BOM: &[u8] = b"\xEF\xBB\xBF";

/// What an imported file is. The file name from the WebView is not trusted: images and audio are
/// recognised by their magic bytes; text has none, so its extension (`txt` / `md`) is passed
/// separately and checked against a fixed list.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AssetKind<'a> {
    Image,
    Text { extension: &'a str },
    Audio,
}
/// Hex characters of the SHA-256 digest used as the file name (128 bits is ample for dedupe).
const HASH_HEX_LEN: usize = 32;
const SVG_SNIFF_BYTES: usize = 4096;

/// Detects the image format from magic bytes; the file name / MIME from the WebView is not trusted.
///
/// SVG is accepted because the bundled sample photos are SVG. It is only ever rendered through
/// `<img>` / canvas, where scripts inside the SVG do not run.
fn detect_extension(bytes: &[u8]) -> Option<&'static str> {
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

/// Detects the audio format from magic bytes.
fn detect_audio_extension(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"ID3") {
        return Some("mp3");
    }
    // MPEG audio frame：11 個 1 的同步碼，layer 欄位不是 00（00 是 AAC ADTS，不收）
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] & 0xE0 == 0xE0 && bytes[1] & 0x06 != 0 {
        return Some("mp3");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WAVE" {
        return Some("wav");
    }
    if bytes.starts_with(b"OggS") {
        return Some("ogg");
    }
    // MP4 容器只收音訊的 brand；isom / mp42 多半是影片
    if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" && matches!(&bytes[8..12], b"M4A " | b"M4B ") {
        return Some("m4a");
    }
    None
}

/// Checks a text asset and returns the bytes to store: valid UTF-8 without the BOM (so the same
/// text with and without a BOM is stored once) and without NUL characters.
fn text_content(bytes: &[u8]) -> AppResult<&str> {
    let content = bytes.strip_prefix(UTF8_BOM).unwrap_or(bytes);
    if content.is_empty() {
        return Err(AppError::invalid_input("文字檔是空的"));
    }
    if content.len() > TEXT_ASSET_MAX_BYTES {
        return Err(AppError::invalid_input("文字檔超過 200 KB 上限"));
    }
    let text = std::str::from_utf8(content).map_err(|_| AppError::invalid_input("文字檔不是 UTF-8 編碼"))?;
    if text.contains('\0') {
        return Err(AppError::invalid_input("不是文字檔"));
    }
    Ok(text)
}

/// Writes `bytes` to `<root>/<dir>/<hash>.<extension>` unless the file already exists.
fn store(root: &Path, dir: &str, bytes: &[u8], extension: &str) -> AppResult<String> {
    // GenericArray 的 LowerHex 支援 precision：輸出摘要的前 HASH_HEX_LEN 個 hex 字元
    let file_name = format!("{:.*x}.{extension}", HASH_HEX_LEN, Sha256::digest(bytes));
    let folder = root.join(dir);
    fs::create_dir_all(&folder)?;
    let target = folder.join(&file_name);
    if !target.exists() {
        let tmp = folder.join(format!("{file_name}.tmp"));
        fs::write(&tmp, bytes)?;
        fs::rename(&tmp, &target)?;
    }
    Ok(format!("{dir}/{file_name}"))
}

/// Stores a file in the project, named by content hash so identical files are stored once.
/// Existing files are never rewritten, which keeps undo history and backups valid.
///
/// # Returns
/// The project-relative path, e.g. `assets/images/<hash>.png` or `assets/texts/<hash>.md`.
///
/// # Errors
/// Returns `AppError::InvalidInput` (user-facing Chinese) for empty, oversized or unsupported
/// data, `AppError::Io` on write failure.
pub fn import_asset(root: &Path, bytes: &[u8], kind: AssetKind<'_>) -> AppResult<String> {
    match kind {
        AssetKind::Image => {
            if bytes.is_empty() {
                return Err(AppError::invalid_input("圖片檔案是空的"));
            }
            if bytes.len() > MAX_ASSET_BYTES {
                return Err(AppError::invalid_input("圖片超過 20 MB 上限"));
            }
            let extension = detect_extension(bytes).ok_or_else(|| AppError::invalid_input("不是支援的圖片格式"))?;
            store(root, ASSET_DIR, bytes, extension)
        }
        AssetKind::Text { extension } => {
            if !matches!(extension, "txt" | "md") {
                return Err(AppError::invalid_input("文字檔只接受 .txt 與 .md"));
            }
            store(root, TEXT_ASSET_DIR, text_content(bytes)?.as_bytes(), extension)
        }
        AssetKind::Audio => {
            if bytes.is_empty() {
                return Err(AppError::invalid_input("音訊檔案是空的"));
            }
            if bytes.len() > AUDIO_ASSET_MAX_BYTES {
                return Err(AppError::invalid_input("音訊超過 50 MB 上限"));
            }
            let extension = detect_audio_extension(bytes)
                .ok_or_else(|| AppError::invalid_input("不是支援的音訊格式（MP3、WAV、M4A、OGG）"))?;
            store(root, AUDIO_ASSET_DIR, bytes, extension)
        }
    }
}


/// Reads a text asset of the library in full (the frontend cannot fetch asset URLs under the CSP).
///
/// # Errors
/// Returns `AppError::InvalidProject` for a path outside `assets/texts/`, `AppError::InvalidInput`
/// for content that is not acceptable text, `AppError::Io` when the file cannot be read.
pub fn read_text(root: &Path, src: &str) -> AppResult<String> {
    format::validate_asset_path_in(src, TEXT_ASSET_DIR)?;
    let bytes = fs::read(root.join(src))?;
    // 存進來時已檢查過；這裡再檢查一次，避免讀到被外部換掉的大檔案或二進位檔
    text_content(&bytes).map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::io::asset_dir;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    fn import_bytes(root: &Path, bytes: &[u8]) -> AppResult<String> {
        import_asset(root, bytes, AssetKind::Image)
    }

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

    fn text(extension: &str) -> AssetKind<'_> {
        AssetKind::Text { extension }
    }

    #[test]
    fn detects_audio_formats() {
        assert_eq!(detect_audio_extension(b"ID3\x04\0\0rest"), Some("mp3"));
        assert_eq!(detect_audio_extension(b"\xFF\xFB\x90\x64"), Some("mp3"));
        assert_eq!(detect_audio_extension(b"RIFF\0\0\0\0WAVEfmt "), Some("wav"));
        assert_eq!(detect_audio_extension(b"OggS\0\x02"), Some("ogg"));
        assert_eq!(detect_audio_extension(b"\0\0\0\x20ftypM4A \0\0\0\0"), Some("m4a"));
        // AAC ADTS（layer 00）、MP4 影片、WebP（RIFF 但不是 WAVE）、圖片、執行檔都不是
        assert_eq!(detect_audio_extension(b"\xFF\xF1\x50\x80"), None);
        assert_eq!(detect_audio_extension(b"\0\0\0\x20ftypisom\0\0\0\0"), None);
        assert_eq!(detect_audio_extension(b"RIFF\0\0\0\0WEBPVP8 "), None);
        assert_eq!(detect_audio_extension(PNG), None);
        assert_eq!(detect_audio_extension(b"MZ\x90\0"), None);
        assert_eq!(detect_audio_extension(b""), None);
    }

    #[test]
    fn imports_audio_into_its_own_dir() {
        let dir = tempfile::tempdir().unwrap();
        let src = import_asset(dir.path(), b"ID3\x04\0\0audio", AssetKind::Audio).unwrap();
        assert!(src.starts_with("assets/audio/") && src.ends_with(".mp3"), "{src}");
        assert!(dir.path().join(&src).exists());
        // 圖片當音訊、空檔、太大都拒絕
        assert!(import_asset(dir.path(), PNG, AssetKind::Audio).is_err());
        assert!(import_asset(dir.path(), b"", AssetKind::Audio).is_err());
        let mut big = b"ID3".to_vec();
        big.resize(AUDIO_ASSET_MAX_BYTES + 1, 0);
        assert!(import_asset(dir.path(), &big, AssetKind::Audio).is_err());
    }

    #[test]
    fn imports_text_without_bom_and_dedupes() {
        let dir = tempfile::tempdir().unwrap();
        let plain = import_asset(dir.path(), "# 創刊詞\n內文".as_bytes(), text("md")).unwrap();
        assert!(plain.starts_with("assets/texts/") && plain.ends_with(".md"), "{plain}");
        // 有 BOM 的同一份文字只存一次，存下來的內容沒有 BOM
        let with_bom = import_asset(dir.path(), "\u{feff}# 創刊詞\n內文".as_bytes(), text("md")).unwrap();
        assert_eq!(with_bom, plain);
        assert_eq!(fs::read(dir.path().join(&plain)).unwrap(), "# 創刊詞\n內文".as_bytes());
        assert_eq!(read_text(dir.path(), &plain).unwrap(), "# 創刊詞\n內文");
        // 同內容、不同副檔名是不同的檔案
        let txt = import_asset(dir.path(), "# 創刊詞\n內文".as_bytes(), text("txt")).unwrap();
        assert!(txt.ends_with(".txt"));
    }

    #[test]
    fn rejects_bad_text() {
        let dir = tempfile::tempdir().unwrap();
        for (label, bytes, extension) in [
            ("empty", b"".as_slice(), "txt"),
            ("only bom", UTF8_BOM, "txt"),
            ("not utf-8 (Big5)", b"\xa4\xa4\xa4\xe5".as_slice(), "txt"),
            ("nul", b"a\0b".as_slice(), "txt"),
            ("png as text", PNG, "txt"),
            ("other extension", b"hello".as_slice(), "html"),
            ("extension with a path", b"hello".as_slice(), "../x"),
        ] {
            assert!(import_asset(dir.path(), bytes, text(extension)).is_err(), "{label} should be rejected");
        }
        let mut big = "字".repeat(TEXT_ASSET_MAX_BYTES / 3 + 1).into_bytes();
        assert!(import_asset(dir.path(), &big, text("txt")).is_err());
        big.truncate(TEXT_ASSET_MAX_BYTES - TEXT_ASSET_MAX_BYTES % 3);
        assert!(import_asset(dir.path(), &big, text("txt")).is_ok());
    }

    #[test]
    fn read_text_only_reads_text_assets() {
        let dir = tempfile::tempdir().unwrap();
        let image = import_bytes(dir.path(), PNG).unwrap();
        assert!(read_text(dir.path(), &image).is_err());
        assert!(read_text(dir.path(), "assets/texts/../../secret.txt").is_err());
        assert!(read_text(dir.path(), "assets/texts/missing.txt").is_err());
    }
}
