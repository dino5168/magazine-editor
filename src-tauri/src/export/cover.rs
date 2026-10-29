//! The cover picture sent with an upload: the first page, drawn by typst-render like a PowerPoint
//! slide (the same layout as the PDF), 600 px wide. Plan: `docs/13-Plans-電子書上傳/5-desktop上傳-實作-V2.md` §4.4.

use super::pdf::compile_document;
use super::pptx::raster::{has_raster_photo, rasterize_at, SlideImage, SlideImageFormat};
use super::ExportRequest;
use crate::error::AppResult;
use std::path::Path;
use typst::text::Font;

/// Width of the cover picture.
pub const COVER_WIDTH_PX: f64 = 600.0;
/// The server refuses bigger covers (web-magazine contract: `cover` ≤ 5 MB).
pub const COVER_MAX_BYTES: usize = 5 * 1024 * 1024;

/// Draws the first page as the cover.
///
/// Only the first page is laid out, so a 200-page document costs one page. A page with a photo
/// becomes a JPEG, any other a PNG; a PNG over the limit is tried again as JPEG.
///
/// # Args
/// * `root` - The project folder (images, project fonts).
/// * `request` - The export request; consumed (its other pages are dropped).
/// * `fonts` - The parsed bundled fonts.
///
/// # Returns
/// The picture, or `None` for a document without pages or a cover still over the limit (the
/// upload then goes without one).
///
/// # Errors
/// `AppError::Export` / `InvalidProject` / `InvalidInput` when the page cannot be laid out or
/// encoded.
pub fn render_cover(root: &Path, mut request: ExportRequest, fonts: Vec<Font>) -> AppResult<Option<SlideImage>> {
    request.document.pages.truncate(1);
    if request.document.pages.is_empty() {
        return Ok(None);
    }
    let compiled = compile_document(root, &request, fonts)?;
    let (Some(page), Some(render)) = (compiled.pages.pages().first(), compiled.render.pages.first()) else {
        return Ok(None);
    };
    let pixel_per_pt = COVER_WIDTH_PX / render.width;
    let format = if has_raster_photo(render) { SlideImageFormat::Jpeg } else { SlideImageFormat::Png };
    let mut image = rasterize_at(page, format, pixel_per_pt)?;
    if image.bytes.len() > COVER_MAX_BYTES && format == SlideImageFormat::Png {
        image = rasterize_at(page, SlideImageFormat::Jpeg, pixel_per_pt)?;
    }
    Ok((image.bytes.len() <= COVER_MAX_BYTES).then_some(image))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::test_support::{fixture_document, fonts, photo_frame_request, project_with_image, request};

    fn dimensions(image: &SlideImage) -> (u32, u32) {
        let decoded = image::load_from_memory(&image.bytes).unwrap();
        (decoded.width(), decoded.height())
    }

    #[test]
    fn cover_is_the_first_page_600_px_wide() {
        let root = project_with_image();
        let mut document = fixture_document();
        let (width, height) = (document.pages[0].width, document.pages[0].height);
        // 第二頁故意做成橫的：封面只看第一頁
        let mut second = document.pages[0].clone();
        second.id = "page-second".into();
        (second.width, second.height) = (height, width);
        document.pages.push(second);
        let cover = render_cover(root.path(), request(document), fonts()).unwrap().unwrap();
        let (w, h) = dimensions(&cover);
        assert_eq!(w, 600);
        assert!((f64::from(h) - 600.0 * height / width).abs() <= 1.0, "{w}×{h} keeps the first page's ratio");
        assert!(cover.bytes.len() <= COVER_MAX_BYTES);
    }

    #[test]
    fn pages_with_photos_become_jpeg() {
        let (root, req) = photo_frame_request();
        let cover = render_cover(root.path(), req, fonts()).unwrap().unwrap();
        assert_eq!(cover.format, SlideImageFormat::Jpeg);
        assert!(cover.bytes.starts_with(&[0xFF, 0xD8]), "JPEG");
    }

    #[test]
    fn pages_without_photos_become_png() {
        let root = project_with_image();
        let mut document = fixture_document();
        for page in &mut document.pages {
            page.elements.retain(|element| !matches!(element, crate::project::format::Element::Image(_)));
        }
        let cover = render_cover(root.path(), request(document), fonts()).unwrap().unwrap();
        assert_eq!(cover.format, SlideImageFormat::Png);
        assert!(cover.bytes.starts_with(b"\x89PNG"));
    }
}
