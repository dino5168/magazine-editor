//! One document page → one fixed-layout XHTML file around the shared page markup.

use crate::export::html::markup::{escape, page_div};
use crate::export::html::{PageImages, LANGUAGE};
use crate::export::render::RenderPage;

/// Builds the XHTML of one page.
///
/// # Args
/// * `page` - The page to draw.
/// * `title` - Page title (already falls back to a generated name when the page name is empty).
/// * `images` - Where each project image was placed inside the EPUB; images missing from it are
///   not drawn.
pub fn page(page: &RenderPage, title: &str, images: &PageImages) -> String {
    // viewport 用整數；頁面本身維持精確尺寸，多出的不到 1px 由 body 的同色背景補上
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{lang}" lang="{lang}">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width={vw}, height={vh}"/>
<title>{title}</title>
<link rel="stylesheet" type="text/css" href="../styles/page.css"/>
</head>
<body style="background:{bg}">
{page}
</body>
</html>
"#,
        lang = LANGUAGE,
        vw = page.width.ceil() as u64,
        vh = page.height.ceil() as u64,
        title = escape(title),
        bg = page.background,
        // 頁面在 pages/ 底下，圖片在上一層的 images/
        page = page_div(page, images, "../"),
    )
}
