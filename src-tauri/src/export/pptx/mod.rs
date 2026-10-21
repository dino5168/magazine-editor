//! PowerPoint output: one slide per page, each a full-slide picture of the Typst layout (the same
//! layout as the PDF). Plan: `docs/03-Plans-匯出檔案/03-匯出PowerPoint 檔案-實作.md`.

pub mod package;
pub mod raster;

use super::pdf::compile_document;
use super::render::{RenderKind, RenderPage};
use super::{ExportOutput, ExportRequest};
use crate::error::{AppError, AppResult};
use package::{pptx_package, PackageMeta, Slide};
use std::path::Path;
use typst::text::Font;

/// The presentation slide sizes in pt, landscape (`PAGE_SIZE_PRESETS` group `slides` in
/// `src/lib/editor/units.ts`): PPT 16:9, 4:3, 16:10, Google 簡報 16:9. Either orientation is fine.
pub const SLIDE_SIZES_PT: [(f64, f64); 4] = [(960.0, 540.0), (720.0, 540.0), (720.0, 450.0), (720.0, 405.0)];
/// Same as `PRESET_TOLERANCE_PT` / `SAME_SIZE_TOLERANCE_PT` in the frontend.
const SIZE_TOLERANCE_PT: f64 = 0.5;

fn close(a: f64, b: f64) -> bool {
    (a - b).abs() <= SIZE_TOLERANCE_PT
}

/// Tells whether a page size is a slide size, in either orientation.
pub fn is_slide_size(width: f64, height: f64) -> bool {
    SLIDE_SIZES_PT.iter().any(|&(w, h)| (close(width, w) && close(height, h)) || (close(width, h) && close(height, w)))
}

/// Checks the rule of `pptxExportProblem` (frontend) again: the request comes from the WebView.
///
/// # Returns
/// The slide size (the first page's) in pt.
///
/// # Errors
/// `AppError::InvalidInput` with a message for the user.
pub fn slide_size(request: &ExportRequest) -> AppResult<(f64, f64)> {
    let pages = &request.document.pages;
    let first = pages.first().ok_or_else(|| AppError::invalid_input("文件沒有頁面"))?;
    if !is_slide_size(first.width, first.height) {
        return Err(AppError::invalid_input("只有簡報尺寸（PPT 16:9、4:3、16:10、Google 簡報 16:9）的文件可以匯出 PowerPoint，請到「設定 → 文件 → 頁面設定」更換紙張"));
    }
    if pages.iter().any(|page| !close(page.width, first.width) || !close(page.height, first.height)) {
        return Err(AppError::invalid_input("PowerPoint 每張投影片一樣大：請先到「設定 → 文件 → 頁面設定」把所有頁面設成同一個尺寸"));
    }
    Ok((first.width, first.height))
}

/// The page's text for the picture's alt text: every text box (shape labels and page numbers
/// included), bottom-most first, one line per wrapped line.
pub fn page_text(page: &RenderPage) -> String {
    page.elements
        .iter()
        .filter_map(|element| match &element.kind {
            RenderKind::Text(text) => {
                let lines: Vec<&str> = text.lines.iter().map(|line| line.trim()).filter(|line| !line.is_empty()).collect();
                (!lines.is_empty()).then(|| lines.join("\n"))
            }
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// `YYYY-MM-DDThh:mm:ssZ` (W3CDTF without fractions).
fn created_now() -> String {
    let now = crate::project::now();
    match now.get(..19) {
        Some(seconds) => format!("{seconds}Z"),
        None => now,
    }
}

/// Builds the `.pptx` file.
///
/// # Errors
/// `AppError::InvalidInput` when the document is not one slide size, `AppError::InvalidProject`
/// for invalid content, `AppError::Export` when Typst or encoding fails.
pub fn build_pptx(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<ExportOutput> {
    let (width, height) = slide_size(request)?;
    let compiled = compile_document(root, request, fonts)?;
    let images = raster::rasterize_pages(&compiled)?;
    let slides: Vec<Slide> = images
        .into_iter()
        .zip(&compiled.render.pages)
        .map(|(image, page)| Slide { image, alt_text: page_text(page), name: page.name.clone() })
        .collect();
    let created = created_now();
    let meta = PackageMeta { title: &compiled.render.title, width, height, created: &created };
    let bytes = pptx_package(&meta, &slides)?;
    Ok(ExportOutput { bytes, pages: slides.len(), skipped_images: compiled.skipped_images })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::test_support::{fixture_document, fonts, project_with_image, request};
    use std::io::Read;

    fn slide_request(width: f64, height: f64) -> ExportRequest {
        let mut document = fixture_document();
        for page in &mut document.pages {
            page.width = width;
            page.height = height;
        }
        request(document)
    }

    #[test]
    fn only_documents_of_one_slide_size_are_accepted() {
        for &(w, h) in &SLIDE_SIZES_PT {
            assert_eq!(slide_size(&slide_request(w, h)).unwrap(), (w, h));
            assert_eq!(slide_size(&slide_request(h, w)).unwrap(), (h, w), "portrait slides too");
        }
        assert!(slide_size(&slide_request(960.3, 539.8)).is_ok());
        assert!(matches!(slide_size(&slide_request(595.28, 841.89)), Err(AppError::InvalidInput(_))), "A4");
        assert!(matches!(slide_size(&slide_request(1000.0, 540.0)), Err(AppError::InvalidInput(_))));
        let mut mixed = slide_request(960.0, 540.0);
        let mut second = mixed.document.pages[0].clone();
        second.id = "page-second".into();
        second.width = 720.0;
        mixed.document.pages.push(second);
        assert!(matches!(slide_size(&mixed), Err(AppError::InvalidInput(message)) if message.contains("同一個尺寸")));
    }

    #[test]
    fn slide_sizes_match_the_frontend_presets() {
        // units.ts 以英吋換算：16:9 寬 13.333… in、高 7.5 in；16:10 6.25 in；Google 5.625 in
        assert!((SLIDE_SIZES_PT[0].0 - 40.0 / 3.0 * 72.0).abs() < 1e-9 && SLIDE_SIZES_PT[0].1 == 7.5 * 72.0);
        assert_eq!(SLIDE_SIZES_PT[1], (10.0 * 72.0, 7.5 * 72.0));
        assert_eq!(SLIDE_SIZES_PT[2], (10.0 * 72.0, 6.25 * 72.0));
        assert_eq!(SLIDE_SIZES_PT[3], (10.0 * 72.0, 5.625 * 72.0));
    }

    #[test]
    fn builds_a_presentation_with_one_picture_per_page() {
        let root = project_with_image();
        let req = slide_request(960.0, 540.0);
        let output = build_pptx(root.path(), &req, fonts()).unwrap();
        assert_eq!(output.pages, req.document.pages.len());
        let mut archive = zip::ZipArchive::new(std::io::Cursor::new(output.bytes)).unwrap();
        let mut presentation = String::new();
        archive.by_name("ppt/presentation.xml").unwrap().read_to_string(&mut presentation).unwrap();
        assert!(presentation.contains(r#"<p:sldSz cx="12192000" cy="6858000"/>"#));
        let mut slide = String::new();
        archive.by_name("ppt/slides/slide1.xml").unwrap().read_to_string(&mut slide).unwrap();
        let doc = roxmltree::Document::parse(&slide).unwrap();
        let picture = doc.descendants().find(|n| n.has_tag_name("cNvPr") && n.attribute("id") == Some("2")).unwrap();
        // 頁面的文字（含圖形內文字；主頁內容與頁碼由前端展開成頁面的物件，也會算進來）放在替代文字
        let alt = picture.attribute("descr").unwrap();
        assert!(alt.contains("雜誌標題") && alt.contains("圖形內文字"), "{alt}");
        // fixture 第 1 頁有圖片物件 → JPEG
        let mut image = Vec::new();
        archive.by_name("ppt/media/image1.jpeg").unwrap().read_to_end(&mut image).unwrap();
        let decoded = image::load_from_memory(&image).unwrap();
        assert_eq!((decoded.width(), decoded.height()), (2880, 1620));
    }

    #[test]
    fn rejects_a_paper_document_before_laying_it_out() {
        let root = project_with_image();
        let result = build_pptx(root.path(), &request(fixture_document()), fonts());
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn page_text_joins_text_boxes_and_skips_empty_lines() {
        let root = project_with_image();
        let compiled = compile_document(root.path(), &slide_request(960.0, 540.0), fonts()).unwrap();
        let text = page_text(&compiled.render.pages[0]);
        assert!(!text.lines().any(|line| line.trim().is_empty()), "{text:?}");
        let empty = RenderPage { name: String::new(), width: 1.0, height: 1.0, background: "#ffffff".into(), elements: vec![] };
        assert_eq!(page_text(&empty), "");
    }

    /// Writes `<EXPORT_PREVIEW_DIR>/preview.pptx` (open it in PowerPoint): the fixture at 16:9, or
    /// a captured request:
    /// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] [EXPORT_PROJECT_DIR=<project>] cargo test pptx_preview -- --ignored`
    #[test]
    #[ignore]
    fn pptx_preview() {
        let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
        let (_temp, root) = crate::export::test_support::preview_root();
        let req = match std::env::var("EXPORT_REQUEST_JSON") {
            Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
            Err(_) => slide_request(960.0, 540.0),
        };
        let output = build_pptx(&root, &req, fonts()).unwrap();
        std::fs::write(Path::new(&dir).join("preview.pptx"), output.bytes).unwrap();
    }
}
