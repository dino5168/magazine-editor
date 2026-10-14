//! HTML5 flip book: a folder that opens in any browser (`file://` or a static web host) and turns
//! pages like a magazine. Every page is the same markup as an EPUB page ([`crate::export::html`]),
//! scaled to the viewer; page turning is StPageFlip (`vendor/`, MIT).
//!
//! ```text
//! index.html                  the book: every page's markup, inside #book
//! viewer/page-flip.browser.js StPageFlip, unmodified (see vendor/README.md)
//! viewer/page-flip.LICENSE
//! viewer/viewer.js            starts page-flip, scales the pages, toolbar
//! viewer/viewer.css
//! styles/page.css             @font-face + page rules (shared with EPUB)
//! fonts/<file>                bundled fonts of the families the document uses
//! images/image-<n>.<ext>      project images, renamed
//! ```
//!
//! The book's structure lives in `index.html` itself (no separate JSON): browsers block `fetch()`
//! of local files, and the book must open with a double click.

use super::html::markup::{escape, num, page_div};
use super::html::{collect_images, css, non_empty_or, used_fonts, LANGUAGE, UNTITLED_DOCUMENT};
use super::render::{build_render, RenderPage};
use super::ExportRequest;
use crate::error::{AppError, AppResult};
use std::fmt::Write;
use std::path::Path;

const PAGE_FLIP_JS: &str = include_str!("vendor/page-flip.browser.js");
const PAGE_FLIP_LICENSE: &str = include_str!("vendor/page-flip.LICENSE");
const VIEWER_JS: &str = include_str!("viewer/viewer.js");
const VIEWER_CSS: &str = include_str!("viewer/viewer.css");

/// Only files that ship with the book load: the viewer's scripts and styles, the pages' fonts and
/// images. Inline styles are needed for the page markup and for page-flip's injected `<style>`.
const CONTENT_SECURITY_POLICY: &str =
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'";

/// Pages whose size differs from the book by less than this (pt) are drawn as they are.
const SIZE_TOLERANCE_PT: f64 = 0.01;

/// The exported book, still in memory.
#[derive(Debug)]
pub struct FlipbookOutput {
    /// Every file of the book: path relative to the book folder (`/`-separated), and contents.
    pub files: Vec<(String, Vec<u8>)>,
    pub pages: usize,
    /// Images skipped because their file no longer exists in the project, or it is not a format
    /// browsers show.
    pub skipped_images: usize,
}

/// Whether a page name is the editor's default (`Page-N`, see `nextPageNames` in
/// `src/lib/editor/element-factory.ts`) or blank. Only pages the user named go into the table of
/// contents.
fn is_default_page_name(name: &str) -> bool {
    let name = name.trim();
    name.is_empty() || name.strip_prefix("Page-").is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// How a page sits in the book's page box: unchanged, or scaled down to fit and centred (the
/// flip engine needs one page size; the book takes the first page's).
///
/// # Returns
/// The extra transform for `.fb-scale`, after the viewer's own scale, or `None` for a page of the
/// book's size.
fn fit_transform(page: &RenderPage, book_width: f64, book_height: f64) -> Option<String> {
    if (page.width - book_width).abs() < SIZE_TOLERANCE_PT && (page.height - book_height).abs() < SIZE_TOLERANCE_PT {
        return None;
    }
    let k = (book_width / page.width).min(book_height / page.height);
    let dx = (book_width - page.width * k) / 2.0;
    let dy = (book_height - page.height * k) / 2.0;
    Some(format!("transform:scale(var(--s,1)) translate({}px,{}px) scale({})", num(dx), num(dy), num(k)))
}

/// Builds every file of the flip book.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::InvalidInput` for unusable layout
/// data or a document without pages.
pub fn build_flipbook(root: &Path, request: &ExportRequest) -> AppResult<FlipbookOutput> {
    let (document, skipped_missing) = build_render(root, request)?;
    let Some(first) = document.pages.first() else {
        return Err(AppError::invalid_input("文件沒有頁面，無法匯出翻頁書"));
    };
    let (book_width, book_height) = (first.width, first.height);
    let (images, skipped_unreadable) = collect_images(root, &document);
    let fonts = used_fonts(&document);
    let title = non_empty_or(&document.title, || UNTITLED_DOCUMENT.to_owned());

    let mut pages = String::new();
    for (n, page) in document.pages.iter().enumerate() {
        let name = non_empty_or(&page.name, || format!("第 {} 頁", n + 1));
        let fit = fit_transform(page, book_width, book_height);
        // 縮小置中的頁面：四周的留白是淺灰（fb-fitted），看得出這一頁的邊界
        let class = if fit.is_some() { "fb-page fb-fitted" } else { "fb-page" };
        let fit = fit.map(|t| format!(r#" style="{t}""#)).unwrap_or_default();
        // data-toc：使用者改過名的頁面才放進目錄
        let toc = if is_default_page_name(&page.name) { "" } else { r#" data-toc="""# };
        let _ = writeln!(
            pages,
            r#"<div class="{class}" data-name="{name}"{toc}><div class="fb-scale"{fit}>{markup}</div></div>"#,
            name = escape(&name),
            // 頁面標記在 index.html 裡，圖片在同一層的 images/
            markup = page_div(page, &images, ""),
        );
    }
    let index = format!(
        r#"<!DOCTYPE html>
<html lang="{lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="{csp}">
<title>{title}</title>
<link rel="stylesheet" href="styles/page.css">
<link rel="stylesheet" href="viewer/viewer.css">
</head>
<body>
<div id="stage"><div id="book" data-width="{w}" data-height="{h}">
{pages}</div></div>
<script src="viewer/page-flip.browser.js"></script>
<script src="viewer/viewer.js"></script>
</body>
</html>
"#,
        lang = LANGUAGE,
        csp = CONTENT_SECURITY_POLICY,
        title = escape(&title),
        w = num(book_width),
        h = num(book_height),
    );

    let mut files: Vec<(String, Vec<u8>)> = vec![
        ("index.html".into(), index.into_bytes()),
        ("viewer/page-flip.browser.js".into(), PAGE_FLIP_JS.as_bytes().to_vec()),
        ("viewer/page-flip.LICENSE".into(), PAGE_FLIP_LICENSE.as_bytes().to_vec()),
        ("viewer/viewer.js".into(), VIEWER_JS.as_bytes().to_vec()),
        ("viewer/viewer.css".into(), VIEWER_CSS.as_bytes().to_vec()),
        // 整份文件的規則（html、body）在 viewer.css，這裡只有字型與 .page 裡的規則
        ("styles/page.css".into(), (css::font_faces(&fonts) + css::PAGE_RULES).into_bytes()),
    ];
    files.extend(fonts.iter().map(|font| (format!("fonts/{}", font.file), font.data.to_vec())));
    files.extend(images.iter().map(|image| (image.href.clone(), image.data.clone())));

    Ok(FlipbookOutput { files, pages: document.pages.len(), skipped_images: skipped_missing + skipped_unreadable })
}

/// Checks that the book can go into `target`: it does not exist yet, or is an empty folder.
///
/// # Errors
/// `AppError::InvalidInput` (shown to the user) when `target` is a file or a folder with content.
pub fn check_target(target: &Path) -> AppResult<()> {
    match std::fs::metadata(target) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
        Ok(meta) if !meta.is_dir() => {
            Err(AppError::invalid_input(format!("「{}」已經是一個檔案，請換一個名稱", target.display())))
        }
        Ok(_) if std::fs::read_dir(target)?.next().is_some() => Err(AppError::invalid_input(format!(
            "資料夾「{}」已存在而且不是空的，請換一個名稱",
            target.display()
        ))),
        Ok(_) => Ok(()),
    }
}

/// Writes the book as the folder `target`: every file goes into a hidden temporary folder next to
/// it first, which is then renamed, so a failed export never leaves half a book behind.
///
/// # Errors
/// See [`check_target`]; `AppError::Io` when writing fails (the temporary folder is removed).
pub fn write_folder(target: &Path, files: &[(String, Vec<u8>)]) -> AppResult<()> {
    check_target(target)?;
    let (Some(parent), Some(name)) = (target.parent(), target.file_name()) else {
        return Err(AppError::invalid_input("無法使用選取的位置"));
    };
    // 每次不同的名稱：不會碰到使用者自己的資料夾，也不用清除上次留下的
    let tmp = parent.join(format!(".{}.{}.tmp", name.to_string_lossy(), uuid::Uuid::new_v4().simple()));
    let result: AppResult<()> = (|| {
        std::fs::create_dir(&tmp)?;
        for (path, data) in files {
            // 路徑都是 build_flipbook 產生的相對路徑（`/` 分隔，沒有 `..`）
            debug_assert!(!path.starts_with('/') && !path.split('/').any(|part| part == ".." || part.is_empty()));
            let file = tmp.join(path);
            if let Some(dir) = file.parent() {
                std::fs::create_dir_all(dir)?;
            }
            std::fs::write(&file, data)?;
        }
        // 寫入期間可能有人放了東西進去，改名前再檢查一次
        check_target(target)?;
        if target.exists() {
            // 空資料夾：Windows 不能改名蓋過資料夾，先移除（只移除空的）
            std::fs::remove_dir(target)?;
        }
        std::fs::rename(&tmp, target)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(&tmp);
    }
    result
}

#[cfg(test)]
mod tests;
