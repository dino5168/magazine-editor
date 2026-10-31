//! One page drawn as a picture for the MCP tool `render_page`, so Claude can see the layout. Same
//! renderer and layout as the PDF and the upload cover (typst-render), never the Konva canvas: what
//! Claude sees is what gets exported, and no selection box or guide can show up.
//! Plan: `docs/14-Plan-ClaudeCode看見畫面/1-看見畫面-實作.md` §5.

use super::pdf::compile_document;
use super::pptx::raster::{encode, has_raster_photo, render_rgb, SlideImage, SlideImageFormat};
use super::ExportRequest;
use crate::error::{AppError, AppResult};
use serde::Deserialize;
use std::path::Path;
use typst::text::Font;

/// Smallest and largest long edge of the picture (px).
pub const PAGE_IMAGE_MIN_PX: u32 = 200;
pub const PAGE_IMAGE_MAX_PX: u32 = 2000;
/// Sharpest zoom for a small region (px per pt).
pub const MAX_PIXEL_PER_PT: f64 = 8.0;
/// The whole page is drawn before a region is cut out: its pixmap stays under this many pixels
/// (about 100 MB of RGBA), which limits the zoom on big pages.
pub const MAX_PIXMAP_PIXELS: f64 = 24_000_000.0;
/// A region must keep at least this much of the page (pt) on each side.
const MIN_REGION_PT: f64 = 1.0;

/// Part of the page to draw, in pt from the page's top-left corner.
#[derive(Debug, Clone, Copy, PartialEq, Deserialize)]
pub struct PageRegion {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct PageImageOptions {
    /// Longest edge of the picture in px (clamped to `PAGE_IMAGE_MIN_PX..=PAGE_IMAGE_MAX_PX`).
    pub max_px: u32,
    /// Part of the page to draw, scaled up to `max_px`; None = the whole page.
    pub region: Option<PageRegion>,
}

/// The encoded picture and what it shows.
#[derive(Debug)]
pub struct PageImage {
    pub image: SlideImage,
    pub width_px: u32,
    pub height_px: u32,
    pub page_width_pt: f64,
    pub page_height_pt: f64,
    /// The part of the page drawn (the region cut to the page, or the whole page).
    pub area: PageRegion,
}

/// The region cut to the page.
fn clip_region(region: PageRegion, width: f64, height: f64) -> AppResult<PageRegion> {
    let finite = [region.x, region.y, region.width, region.height].iter().all(|value| value.is_finite());
    let left = region.x.max(0.0);
    let top = region.y.max(0.0);
    let right = (region.x + region.width).min(width);
    let bottom = (region.y + region.height).min(height);
    if !finite || right - left < MIN_REGION_PT || bottom - top < MIN_REGION_PT {
        return Err(AppError::invalid_input(format!(
            "region 不在頁面範圍內（頁面是 {width:.2} × {height:.2} pt，region 要和它重疊至少 {MIN_REGION_PT} pt）"
        )));
    }
    Ok(PageRegion { x: left, y: top, width: right - left, height: bottom - top })
}

/// Draws one page of the request (the same layout as the PDF): PNG, or JPEG when the page shows a
/// photo. Only that page is laid out, so a 200-page document costs one page.
///
/// # Args
/// * `root` - The project folder (images, project fonts).
/// * `request` - The export request; consumed (its other pages are dropped).
/// * `page_index` - The page to draw (0-based, in `request`).
/// * `options` - Size and region.
/// * `fonts` - The parsed bundled fonts.
///
/// # Errors
/// `AppError::InvalidInput` for a page index or region outside the document / page;
/// `AppError::Export` when the page cannot be laid out or encoded.
pub fn render_page_image(
    root: &Path,
    mut request: ExportRequest,
    page_index: usize,
    options: &PageImageOptions,
    fonts: Vec<Font>,
) -> AppResult<PageImage> {
    if page_index >= request.document.pages.len() {
        return Err(AppError::invalid_input("沒有這一頁"));
    }
    let page = request.document.pages.swap_remove(page_index);
    request.document.pages = vec![page];
    let compiled = compile_document(root, &request, fonts)?;
    let (Some(page), Some(render)) = (compiled.pages.pages().first(), compiled.render.pages.first()) else {
        return Err(AppError::Export("無法排版這一頁".into()));
    };
    let (page_width, page_height) = (render.width, render.height);
    let whole = PageRegion { x: 0.0, y: 0.0, width: page_width, height: page_height };
    let area = match options.region {
        Some(region) => clip_region(region, page_width, page_height)?,
        None => whole,
    };
    let max_px = f64::from(options.max_px.clamp(PAGE_IMAGE_MIN_PX, PAGE_IMAGE_MAX_PX));
    let pixel_per_pt = (max_px / area.width.max(area.height))
        .min(MAX_PIXEL_PER_PT)
        .min((MAX_PIXMAP_PIXELS / (page_width * page_height)).sqrt());
    let mut rgb = render_rgb(page, pixel_per_pt)?;
    if options.region.is_some() {
        let (full_width, full_height) = rgb.dimensions();
        let to_px = |pt: f64, limit: u32| ((pt * pixel_per_pt).round().max(0.0) as u32).min(limit);
        let (left, top) = (to_px(area.x, full_width), to_px(area.y, full_height));
        let right = to_px(area.x + area.width, full_width).max(left + 1).min(full_width);
        let bottom = to_px(area.y + area.height, full_height).max(top + 1).min(full_height);
        rgb = image::imageops::crop_imm(&rgb, left, top, right - left, bottom - top).to_image();
    }
    let format = if has_raster_photo(render) { SlideImageFormat::Jpeg } else { SlideImageFormat::Png };
    let (width_px, height_px) = rgb.dimensions();
    Ok(PageImage { image: encode(&rgb, format)?, width_px, height_px, page_width_pt: page_width, page_height_pt: page_height, area })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::test_support::{fixture_document, fonts, photo_frame_request, project_with_image, request};
    use crate::project::format::Document;

    /// The fixture's first page with nothing on it but a background, so every pixel has its color.
    fn plain_page(background: &str) -> Document {
        let mut document = fixture_document();
        document.pages.truncate(1);
        document.pages[0].elements.clear();
        document.pages[0].background = background.into();
        document
    }

    fn decoded(image: &PageImage) -> image::RgbImage {
        image::load_from_memory(&image.image.bytes).unwrap().to_rgb8()
    }

    fn options(max_px: u32, region: Option<PageRegion>) -> PageImageOptions {
        PageImageOptions { max_px, region }
    }

    #[test]
    fn whole_page_fits_the_long_edge() {
        let root = project_with_image();
        let document = fixture_document();
        let (width, height) = (document.pages[0].width, document.pages[0].height);
        let image = render_page_image(root.path(), request(document), 0, &options(800, None), fonts()).unwrap();
        let pixels = decoded(&image);
        assert_eq!((pixels.width(), pixels.height()), (image.width_px, image.height_px));
        assert_eq!(image.width_px.max(image.height_px), 800);
        let ratio = f64::from(image.width_px) / f64::from(image.height_px);
        assert!((ratio - width / height).abs() < 0.01, "keeps the page's proportions");
        assert_eq!((image.page_width_pt, image.page_height_pt), (width, height));
    }

    #[test]
    fn draws_the_requested_page_only() {
        let root = project_with_image();
        let mut document = plain_page("#ffffff");
        let mut second = document.pages[0].clone();
        second.id = "page-second".into();
        second.background = "#00ff00".into();
        document.pages.push(second);
        let image = render_page_image(root.path(), request(document), 1, &options(300, None), fonts()).unwrap();
        assert_eq!(decoded(&image).get_pixel(10, 10).0, [0, 255, 0]);
    }

    #[test]
    fn region_is_cut_out_and_scaled_up() {
        let root = project_with_image();
        let mut document = plain_page("#ffffff");
        // 左上 100 × 50 pt 是紅色，其他是白色
        let mut red = fixture_document().pages[0]
            .elements
            .iter()
            .find_map(|element| match element {
                crate::project::format::Element::Shape(shape) if shape.image.is_none() && shape.label.is_none() => Some(shape.clone()),
                _ => None,
            })
            .expect("fixture has a plain shape");
        (red.base.x, red.base.y, red.base.rotation) = (0.0, 0.0, 0.0);
        (red.width, red.height) = (100.0, 50.0);
        red.geometry = crate::project::format::ShapeGeometry::Rect { corner_radius: crate::project::format::CornerRadius::Uniform(0.0) };
        red.fill = "#ff0000".into();
        red.stroke = None;
        document.pages[0].elements.push(crate::project::format::Element::Shape(red));
        let region = PageRegion { x: 50.0, y: 0.0, width: 100.0, height: 50.0 };
        // 600 / 100 = 6 px/pt，在 A4 的上限（約 6.9）之內
        let image = render_page_image(root.path(), request(document), 0, &options(600, Some(region)), fonts()).unwrap();
        assert_eq!((image.width_px, image.height_px), (600, 300));
        let pixels = decoded(&image);
        // region 的左半是紅色方塊的右半，右半是白色
        assert_eq!(pixels.get_pixel(150, 150).0, [255, 0, 0]);
        assert_eq!(pixels.get_pixel(450, 150).0, [255, 255, 255]);
    }

    #[test]
    fn region_is_cut_to_the_page_and_rejected_outside_it() {
        let root = project_with_image();
        let document = plain_page("#ffffff");
        let (width, height) = (document.pages[0].width, document.pages[0].height);
        let partly = PageRegion { x: width - 100.0, y: -50.0, width: 200.0, height: 150.0 };
        let image = render_page_image(root.path(), request(document.clone()), 0, &options(400, Some(partly)), fonts()).unwrap();
        assert_eq!(image.area, PageRegion { x: width - 100.0, y: 0.0, width: 100.0, height: 100.0 });
        assert_eq!((image.width_px, image.height_px), (400, 400));
        let outside = PageRegion { x: width + 10.0, y: 0.0, width: 50.0, height };
        let error = render_page_image(root.path(), request(document), 0, &options(400, Some(outside)), fonts()).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(ref message) if message.contains("region")));
    }

    #[test]
    fn small_regions_stop_at_the_zoom_limit() {
        let root = project_with_image();
        let document = plain_page("#ffffff");
        let (width, height) = (document.pages[0].width, document.pages[0].height);
        let region = PageRegion { x: 10.0, y: 10.0, width: 20.0, height: 10.0 };
        let image = render_page_image(root.path(), request(document), 0, &options(2000, Some(region)), fonts()).unwrap();
        // 2000 / 20 = 100 px/pt：限制在 MAX_PIXEL_PER_PT 與整頁像素上限（A4 約 6.9 px/pt）較小的那個
        let limit = MAX_PIXEL_PER_PT.min((MAX_PIXMAP_PIXELS / (width * height)).sqrt());
        assert!(limit < 8.0 && limit > 6.0, "A4: {limit}");
        let expected = |pt: f64| (pt * limit).round() as i64;
        assert!((i64::from(image.width_px) - expected(20.0)).abs() <= 1, "{}", image.width_px);
        assert!((i64::from(image.height_px) - expected(10.0)).abs() <= 1, "{}", image.height_px);
    }

    #[test]
    fn size_is_clamped_and_bad_pages_are_rejected() {
        let root = project_with_image();
        let image = render_page_image(root.path(), request(plain_page("#ffffff")), 0, &options(10, None), fonts()).unwrap();
        assert_eq!(image.width_px.max(image.height_px), PAGE_IMAGE_MIN_PX);
        let error = render_page_image(root.path(), request(plain_page("#ffffff")), 3, &options(400, None), fonts()).unwrap_err();
        assert!(matches!(error, AppError::InvalidInput(_)));
    }

    #[test]
    fn pages_with_photos_become_jpeg_others_png() {
        let (root, req) = photo_frame_request();
        let photo = render_page_image(root.path(), req, 0, &options(400, None), fonts()).unwrap();
        assert_eq!(photo.image.format, SlideImageFormat::Jpeg);
        let root = project_with_image();
        let plain = render_page_image(root.path(), request(plain_page("#ffffff")), 0, &options(400, None), fonts()).unwrap();
        assert_eq!(plain.image.format, SlideImageFormat::Png);
        assert!(plain.image.bytes.starts_with(b"\x89PNG"));
    }
}
