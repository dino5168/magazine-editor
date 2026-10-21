//! The slide pictures: every page drawn by typst-render (the renderer the overlay comparisons use),
//! so a slide shows the same layout as the PDF.
//!
//! A page with a raster photo is stored as JPEG (a PNG of a photo is several MB), every other page
//! as PNG (text and thin lines stay sharp).

use crate::error::{AppError, AppResult};
use crate::export::pdf::CompiledDocument;
use crate::export::render::{RenderKind, RenderPage};
use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::PngEncoder;
use image::{ExtendedColorType, ImageEncoder};
use typst_layout::Page;

/// Picture resolution: 3 px per pt (a 16:9 slide is 2880 × 1620).
pub const PIXELS_PER_PT: f64 = 3.0;
/// JPEG quality of pages with photos.
pub const JPEG_QUALITY: u8 = 92;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlideImageFormat {
    Png,
    Jpeg,
}

impl SlideImageFormat {
    pub fn extension(self) -> &'static str {
        match self {
            Self::Png => "png",
            Self::Jpeg => "jpeg",
        }
    }

    pub fn content_type(self) -> &'static str {
        match self {
            Self::Png => "image/png",
            Self::Jpeg => "image/jpeg",
        }
    }
}

/// One encoded slide picture.
#[derive(Debug)]
pub struct SlideImage {
    pub format: SlideImageFormat,
    pub bytes: Vec<u8>,
    /// Pixels.
    pub width: u32,
    pub height: u32,
}

fn image_error(error: impl std::fmt::Display) -> AppError {
    AppError::Export(format!("無法產生投影片圖片：{error}"))
}

fn is_raster(src: &str) -> bool {
    !src.to_ascii_lowercase().ends_with(".svg")
}

/// Tells whether the page shows a raster photo: an image element or an image frame's photo that
/// is not an SVG.
///
/// # Args
/// * `page` - The page as exported (master content, page numbers and undrawable images already
///   resolved).
pub fn has_raster_photo(page: &RenderPage) -> bool {
    page.elements.iter().any(|element| {
        let image = matches!(&element.kind, RenderKind::Image(image) if is_raster(&image.src));
        image || element.photo.as_ref().is_some_and(|photo| is_raster(&photo.src))
    })
}

/// Draws one page and encodes it.
///
/// # Args
/// * `page` - The Typst page.
/// * `format` - PNG or JPEG.
///
/// # Errors
/// `AppError::Export` when encoding fails.
pub fn rasterize(page: &Page, format: SlideImageFormat) -> AppResult<SlideImage> {
    let pixmap = typst_render::render(page, &typst_render::RenderOptions { pixel_per_pt: PIXELS_PER_PT.into(), ..Default::default() });
    let (width, height) = (pixmap.width(), pixmap.height());
    // 頁面背景一定不透明（#rrggbb，模板的 page fill），所以 premultiplied RGBA 就是 RGB + 255，直接丟掉 alpha。
    // 用 image 的 to_rgb8（在已最佳化的 crate 裡），開發版自己寫迴圈一頁要多 0.2 秒
    let rgba = image::RgbaImage::from_raw(width, height, pixmap.take()).ok_or_else(|| image_error("像素大小不符"))?;
    let rgb = image::DynamicImage::ImageRgba8(rgba).to_rgb8();
    let mut bytes = Vec::new();
    match format {
        SlideImageFormat::Png => PngEncoder::new(&mut bytes).write_image(rgb.as_raw(), width, height, ExtendedColorType::Rgb8),
        SlideImageFormat::Jpeg => {
            JpegEncoder::new_with_quality(&mut bytes, JPEG_QUALITY).write_image(rgb.as_raw(), width, height, ExtendedColorType::Rgb8)
        }
    }
    .map_err(image_error)?;
    Ok(SlideImage { format, bytes, width, height })
}

/// Draws every page, several at a time (one page at 3 px/pt is a ~18 MB pixmap; each worker keeps
/// only one).
///
/// # Errors
/// `AppError::Export` when a page cannot be encoded.
pub fn rasterize_pages(compiled: &CompiledDocument) -> AppResult<Vec<SlideImage>> {
    let pages = compiled.pages.pages();
    let formats: Vec<SlideImageFormat> = compiled
        .render
        .pages
        .iter()
        .map(|page| if has_raster_photo(page) { SlideImageFormat::Jpeg } else { SlideImageFormat::Png })
        .collect();
    let workers = std::thread::available_parallelism().map_or(1, |n| n.get()).min(pages.len()).max(1);
    let mut results: Vec<Option<AppResult<SlideImage>>> = (0..pages.len()).map(|_| None).collect();
    std::thread::scope(|scope| {
        let handles: Vec<_> = (0..workers)
            .map(|worker| {
                let formats = &formats;
                scope.spawn(move || {
                    (worker..pages.len())
                        .step_by(workers)
                        .map(|index| (index, rasterize(&pages[index], formats.get(index).copied().unwrap_or(SlideImageFormat::Png))))
                        .collect::<Vec<_>>()
                })
            })
            .collect();
        for handle in handles {
            match handle.join() {
                Ok(done) => done.into_iter().for_each(|(index, image)| results[index] = Some(image)),
                Err(_) => results.iter_mut().filter(|slot| slot.is_none()).for_each(|slot| {
                    *slot = Some(Err(image_error("執行緒中斷")));
                }),
            }
        }
    });
    results.into_iter().map(|slot| slot.unwrap_or_else(|| Err(image_error("沒有畫出這一頁")))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::pdf::compile_document;
    use crate::export::render::{RenderElement, RenderImage, RenderPhoto};
    use crate::export::test_support::{fixture_document, fonts, photo_frame_request, request};
    use std::time::Instant;

    fn page_with(elements: Vec<RenderElement>) -> RenderPage {
        RenderPage { name: "Page-1".into(), width: 100.0, height: 100.0, background: "#ffffff".into(), elements }
    }

    fn image(src: &str) -> RenderElement {
        let kind = RenderKind::Image(RenderImage { width: 10.0, height: 10.0, src: src.into() });
        RenderElement { x: 0.0, y: 0.0, rotation: 0.0, kind, photo: None }
    }

    #[test]
    fn photos_but_not_svgs_make_a_jpeg_page() {
        assert!(!has_raster_photo(&page_with(vec![])));
        assert!(has_raster_photo(&page_with(vec![image("assets/images/a.jpg")])));
        assert!(has_raster_photo(&page_with(vec![image("assets/images/a.png")])));
        assert!(!has_raster_photo(&page_with(vec![image("assets/images/a.svg")])));
        let mut frame = crate::export::test_support::path_shape_document().pages.remove(0);
        assert!(!has_raster_photo(&frame));
        let photo = |src: &str| Some(RenderPhoto { src: src.into(), x: 0.0, y: 0.0, width: 10.0, height: 10.0 });
        frame.elements[0].photo = photo("assets/images/b.SVG");
        assert!(!has_raster_photo(&frame));
        frame.elements[0].photo = photo("assets/images/b.webp");
        assert!(has_raster_photo(&frame));
    }

    #[test]
    fn every_page_becomes_a_picture_at_three_pixels_per_pt() {
        let (root, req) = photo_frame_request();
        let compiled = compile_document(root.path(), &req, fonts()).unwrap();
        let images = rasterize_pages(&compiled).unwrap();
        assert_eq!(images.len(), compiled.render.pages.len());
        for (image, page) in images.iter().zip(&compiled.render.pages) {
            assert_eq!(image.width, (page.width * 3.0).round() as u32);
            assert_eq!(image.height, (page.height * 3.0).round() as u32);
            let decoded = image::load_from_memory(&image.bytes).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (image.width, image.height));
            let expected = if has_raster_photo(page) { image::ImageFormat::Jpeg } else { image::ImageFormat::Png };
            assert_eq!(image::guess_format(&image.bytes).unwrap(), expected);
        }
        // 第 1 頁的橢圓有照片 → JPEG；照片中心偏左上是紅色（橢圓在 (120, 440)，照片畫在 (0, −5) 120 × 90）
        assert_eq!(images[0].format, SlideImageFormat::Jpeg);
        let first = image::load_from_memory(&images[0].bytes).unwrap().to_rgb8();
        let red = first.get_pixel(((120.0 + 40.0) * 3.0) as u32, ((440.0 + 25.0) * 3.0) as u32);
        assert!(red[0] > 200 && red[1] < 60 && red[2] < 60, "{red:?}");
    }

    #[test]
    fn png_pages_are_lossless_and_opaque() {
        let mut document = fixture_document();
        document.pages.truncate(1);
        document.pages[0].elements.clear();
        document.pages[0].background = "#336699".into();
        let root = crate::export::test_support::project_with_image();
        let compiled = compile_document(root.path(), &request(document), fonts()).unwrap();
        let images = rasterize_pages(&compiled).unwrap();
        assert_eq!(images[0].format, SlideImageFormat::Png);
        let decoded = image::load_from_memory(&images[0].bytes).unwrap();
        assert_eq!(decoded.color(), image::ColorType::Rgb8);
        assert_eq!(decoded.to_rgb8().get_pixel(10, 10).0, [0x33, 0x66, 0x99]);
    }

    /// Writes the slide pictures to `<EXPORT_PREVIEW_DIR>/slides/` and prints how long they took;
    /// `FLIPBOOK_PAGES=<n>` copies the fixture's pages up to n pages (timing a long deck):
    /// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] [EXPORT_PROJECT_DIR=<project>] [FLIPBOOK_PAGES=<n>] cargo test slides_preview -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn slides_preview() {
        let dir = std::path::PathBuf::from(std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR")).join("slides");
        std::fs::create_dir_all(&dir).unwrap();
        let (_temp, root) = crate::export::test_support::preview_root();
        let req = match std::env::var("EXPORT_REQUEST_JSON") {
            Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
            Err(_) => {
                let mut document = fixture_document();
                let count: usize = std::env::var("FLIPBOOK_PAGES").ok().and_then(|n| n.parse().ok()).unwrap_or(document.pages.len());
                let originals = document.pages.clone();
                document.pages = (0..count)
                    .map(|index| {
                        let mut page = originals[index % originals.len()].clone();
                        page.id = format!("page-copy-{index}");
                        page
                    })
                    .collect();
                request(document)
            }
        };
        let started = Instant::now();
        let compiled = compile_document(&root, &req, fonts()).unwrap();
        let laid_out = started.elapsed();
        let images = rasterize_pages(&compiled).unwrap();
        let total = started.elapsed();
        let bytes: usize = images.iter().map(|image| image.bytes.len()).sum();
        println!(
            "{} pages: layout {:.2}s, pictures {:.2}s, {:.1} MB",
            images.len(),
            laid_out.as_secs_f64(),
            (total - laid_out).as_secs_f64(),
            bytes as f64 / 1e6
        );
        for (index, image) in images.iter().enumerate().take(20) {
            std::fs::write(dir.join(format!("slide-{}.{}", index + 1, image.format.extension())), &image.bytes).unwrap();
        }
    }
}
