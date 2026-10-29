//! The flip book as the server takes it: one zip (`export::flipbook::zip_book`, the same bytes as
//! the zip export), checked against the server's rules before anything is sent
//! (web-magazine contract,「4. 上傳翻頁書與封面」).

// 步驟 4 的 upload_flipbook 才呼叫；接上後移除
#![cfg_attr(not(test), allow(dead_code))]

use super::response::{UploadCode, UploadFailure};
use crate::error::{AppError, AppResult};
use crate::export::flipbook::zip_book;

/// File types the server unpacks (`ALLOWED_EXTENSIONS` in web-magazine `service/package.rs`;
/// `gif` and `txt` added by plan step 0). Anything else is silently skipped there, so it is an
/// error here: a missing image or licence would only show up on the website.
pub const ALLOWED_EXTENSIONS: &[&str] = &["html", "css", "js", "svg", "png", "jpg", "jpeg", "webp", "gif", "otf", "ttf", "woff2", "txt"];
/// The server's default upload limit (`MAX_UPLOAD_BYTES`, 100 MB).
pub const MAX_PACKAGE_BYTES: usize = 104_857_600;
/// The server unpacks at most this many files.
pub const MAX_FILES: usize = 5_000;
/// Unpacked, a package may be at most 4 times the upload limit.
pub const MAX_UNPACKED_BYTES: usize = 4 * MAX_PACKAGE_BYTES;

const MB: f64 = 1024.0 * 1024.0;

/// Whether the server keeps this file: an allowed extension, and no part of the path hidden.
fn server_keeps(name: &str) -> bool {
    let hidden = name.split('/').any(|part| part.starts_with('.'));
    let extension = name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase()).unwrap_or_default();
    !hidden && ALLOWED_EXTENSIONS.contains(&extension.as_str())
}

/// Zips the book for upload.
///
/// # Args
/// * `files` - `FlipbookOutput::files`.
///
/// # Returns
/// The zip.
///
/// # Errors
/// `AppError::Export` when the book has a file the server would skip (a bug of this app, the
/// user cannot fix it); `UploadCode::TooLarge` when it is over the server's limits.
pub fn prepare(files: &[(String, Vec<u8>)]) -> AppResult<Vec<u8>> {
    let dropped: Vec<&str> = files.iter().map(|(name, _)| name.as_str()).filter(|name| !server_keeps(name)).collect();
    if !dropped.is_empty() {
        return Err(AppError::Export(format!("翻頁書裡有網站不接受的檔案（{}），請回報這個問題", dropped.join("、"))));
    }
    check_limits(files.len(), files.iter().map(|(_, data)| data.len()).sum(), None)?;
    let zip = zip_book(files)?;
    check_limits(files.len(), 0, Some(zip.len()))?;
    Ok(zip)
}

fn too_large(message: String) -> AppError {
    UploadFailure::new(UploadCode::TooLarge, message).into()
}

/// The server's limits on file count, unpacked size and (once zipped) package size.
fn check_limits(file_count: usize, unpacked: usize, zipped: Option<usize>) -> AppResult<()> {
    if file_count > MAX_FILES {
        return Err(too_large(format!("翻頁書有 {file_count} 個檔案，超過網站上限 {MAX_FILES} 個")));
    }
    if unpacked > MAX_UNPACKED_BYTES {
        return Err(too_large(format!("翻頁書解壓後 {:.0} MB，超過網站上限 {:.0} MB；請縮小圖片後再試", unpacked as f64 / MB, MAX_UNPACKED_BYTES as f64 / MB)));
    }
    if let Some(zipped) = zipped.filter(|&zipped| zipped > MAX_PACKAGE_BYTES) {
        return Err(too_large(format!("翻頁書壓縮後 {:.1} MB，超過網站上限 {:.0} MB；請縮小圖片後再試", zipped as f64 / MB, MAX_PACKAGE_BYTES as f64 / MB)));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::flipbook::build_flipbook;
    use crate::export::test_support::{fixture_document, project_with_image, request};

    fn file(name: &str, len: usize) -> (String, Vec<u8>) {
        (name.to_owned(), vec![b'x'; len])
    }

    #[test]
    fn every_file_of_a_real_book_is_kept_by_the_server() {
        let root = project_with_image();
        let output = build_flipbook(root.path(), &request(fixture_document())).unwrap();
        let zip = prepare(&output.files).unwrap();
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        assert_eq!(archive.len(), output.files.len());
        let mut index = String::new();
        std::io::Read::read_to_string(&mut archive.by_name("index.html").unwrap(), &mut index).unwrap();
        // 伺服器數 class 裡有 fb-page 的元素當頁數
        let pages = index.split("class=\"").skip(1).filter(|rest| rest.split('"').next().unwrap().split_whitespace().any(|c| c == "fb-page")).count();
        assert_eq!(pages, output.pages);
        assert!(archive.by_name("viewer/page-flip.LICENSE.txt").is_ok(), "the MIT licence goes up too");
    }

    #[test]
    fn files_the_server_would_skip_are_an_error() {
        assert!(server_keeps("images/image-1.gif") && server_keeps("viewer/page-flip.LICENSE.txt") && server_keeps("index.HTML"));
        for name in ["viewer/page-flip.LICENSE", "images/a.bmp", ".hidden.css", "fonts/.x/a.ttf", "fonts/a.ttc"] {
            assert!(!server_keeps(name), "{name}");
            let error = prepare(&[file("index.html", 10), file(name, 10)]).unwrap_err();
            assert!(matches!(&error, AppError::Export(message) if message.contains(name)), "{error:?}");
        }
    }

    #[test]
    fn limits_of_the_server_are_checked_before_sending() {
        let too_large = |result: AppResult<()>| matches!(result, Err(AppError::Upload(failure)) if failure.code == UploadCode::TooLarge);
        // 只傳數字：真的配置 400 MB 會讓測試吃光記憶體
        assert!(check_limits(MAX_FILES, MAX_UNPACKED_BYTES, Some(MAX_PACKAGE_BYTES)).is_ok());
        assert!(too_large(check_limits(MAX_FILES + 1, 0, None)));
        assert!(too_large(check_limits(10, MAX_UNPACKED_BYTES + 1, None)), "highly compressible content too");
        assert!(too_large(check_limits(10, 0, Some(MAX_PACKAGE_BYTES + 1))));
        let many: Vec<_> = (0..=MAX_FILES).map(|n| file(&format!("p{n}.css"), 1)).collect();
        assert!(matches!(prepare(&many), Err(AppError::Upload(_))), "prepare checks before zipping");
        assert!(prepare(&[file("index.html", 1000)]).is_ok());
    }
}
