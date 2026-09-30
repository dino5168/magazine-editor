//! PDF output: the render model drawn by the embedded Typst compiler.
//!
//! Typst only positions and renders. Line breaks already come from the editor (see
//! [`super::render`]), so the PDF wraps exactly like the canvas.

use super::render::{build_render, RenderDocument, RenderElement, RenderKind};
use super::world::ExportWorld;
use super::{ExportOutput, ExportRequest};
use crate::error::{AppError, AppResult};
use crate::project::format::Align;
use serde_json::{json, Value};
use std::path::Path;
use typst::diag::Warned;
use typst::text::Font;
use typst_layout::PagedDocument;
use typst_pdf::PdfOptions;

fn align_name(align: Align) -> &'static str {
    match align {
        Align::Left => "left",
        Align::Center => "center",
        Align::Right => "right",
    }
}

fn element_data(element: &RenderElement) -> Value {
    let (x, y, rotation) = (element.x, element.y, element.rotation);
    match &element.kind {
        RenderKind::Text(e) => json!({
            "kind": "text", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "size": e.size, "fonts": e.fonts,
            "bold": e.bold, "align": align_name(e.align), "fill": e.fill,
            "lines": e.lines, "baseline": e.baseline, "lineHeight": e.line_height,
        }),
        RenderKind::Rect(e) => json!({
            "kind": "rect", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "radius": e.corner_radius, "fill": e.fill,
        }),
        RenderKind::Ellipse(e) => json!({
            "kind": "ellipse", "x": x, "y": y, "rotation": rotation,
            "rx": e.rx, "ry": e.ry, "fill": e.fill,
        }),
        RenderKind::Polygon(e) => json!({
            "kind": "polygon", "x": x, "y": y, "rotation": rotation,
            "rx": e.rx, "ry": e.ry, "fill": e.fill, "points": e.points,
        }),
        RenderKind::Image(e) => json!({
            "kind": "image", "x": x, "y": y, "rotation": rotation,
            "width": e.width, "height": e.height, "src": e.src,
        }),
    }
}

/// Builds the JSON that `template.typ` draws.
fn to_data(document: &RenderDocument) -> Value {
    let pages: Vec<Value> = document
        .pages
        .iter()
        .map(|page| {
            let elements: Vec<Value> = page.elements.iter().map(element_data).collect();
            json!({ "width": page.width, "height": page.height, "background": page.background, "elements": elements })
        })
        .collect();
    json!({ "title": document.title, "pages": pages })
}

/// Renders the document to PDF bytes.
///
/// # Errors
/// `AppError::InvalidProject` for invalid content, `AppError::Export` when Typst fails.
pub fn render_pdf(root: &Path, request: &ExportRequest, fonts: Vec<Font>) -> AppResult<ExportOutput> {
    let (document, skipped_images) = build_render(root, request)?;
    let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&document))?, fonts);
    let compiled = compile(&world)?;
    let pdf = typst_pdf::pdf(&compiled, &PdfOptions::default()).map_err(|errors| diagnostics(&errors))?;
    Ok(ExportOutput { bytes: pdf, pages: compiled.pages().len(), skipped_images })
}

fn compile(world: &ExportWorld) -> AppResult<PagedDocument> {
    let Warned { output, .. } = typst::compile::<PagedDocument>(world);
    output.map_err(|errors| diagnostics(&errors))
}

fn diagnostics(errors: &[typst::diag::SourceDiagnostic]) -> AppError {
    let messages: Vec<&str> = errors.iter().map(|error| error.message.as_str()).collect();
    AppError::Export(format!("PDF 排版失敗：{}", messages.join("；")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::export::test_support::{fixture_document, fonts, project_with_image, request};
    use crate::export::TextLayout;
    use crate::project::format::Element;

    fn compiled_pages(root: &Path, request: &ExportRequest) -> PagedDocument {
        let (document, _) = build_render(root, request).unwrap();
        let world = ExportWorld::new(root, serde_json::to_vec(&to_data(&document)).unwrap(), fonts());
        compile(&world).unwrap()
    }

    #[test]
    fn bundled_fonts_cover_latin_and_chinese() {
        let families: Vec<String> = fonts().iter().map(|font| font.info().family.clone()).collect();
        for expected in ["Geist", "Noto Sans TC"] {
            assert!(families.iter().any(|family| family == expected), "missing {expected} in {families:?}");
        }
    }

    #[test]
    fn renders_every_element_type_to_pdf() {
        let root = project_with_image();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert!(output.bytes.starts_with(b"%PDF-"));
        assert_eq!(output.pages, 1);
        assert_eq!(output.skipped_images, 0);
    }

    #[test]
    fn page_size_and_count_follow_the_document() {
        let mut document = fixture_document();
        let mut second = document.pages[0].clone();
        second.id = "page-2".into();
        second.width = 400.0;
        second.height = 300.0;
        second.elements.clear();
        document.pages.push(second);
        let root = project_with_image();
        let compiled = compiled_pages(root.path(), &request(document));
        let sizes: Vec<_> = compiled
            .pages()
            .iter()
            .map(|page| {
                let size = page.frame.size();
                (size.x.to_pt().round(), size.y.to_pt().round())
            })
            .collect();
        assert_eq!(sizes, vec![(595.0, 842.0), (400.0, 300.0)]);
    }

    #[test]
    fn missing_images_are_skipped_not_fatal() {
        let root = tempfile::tempdir().unwrap();
        let output = render_pdf(root.path(), &request(fixture_document()), fonts()).unwrap();
        assert_eq!(output.skipped_images, 1);
    }

    #[test]
    fn user_text_is_data_not_typst_code() {
        let mut document = fixture_document();
        let tricky = r#"#panic("boom") $x$ [a] \ "q" // c"#;
        if let Element::Text(text) = &mut document.pages[0].elements[0] {
            text.text = tricky.to_owned();
        }
        let mut req = request(document);
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![tricky.to_owned()], baseline: 30.0 });
        let root = project_with_image();
        assert!(render_pdf(root.path(), &req, fonts()).is_ok());
    }

    #[test]
    fn rejects_invalid_layout_data() {
        let mut req = request(fixture_document());
        req.text_layouts.insert("el-text".into(), TextLayout { lines: vec![], baseline: f64::NAN });
        let root = project_with_image();
        assert!(matches!(render_pdf(root.path(), &req, fonts()), Err(AppError::InvalidInput(_))));
    }

    /// A lone unrotated rectangle at (100, 100), 200 × 100 pt, on a white page.
    fn single_rect(fill: &str) -> crate::project::format::Document {
        let mut document = fixture_document();
        let page = &mut document.pages[0];
        page.background = "#ffffff".into();
        page.elements.retain(|e| matches!(e, Element::Rect(_)));
        let Element::Rect(rect) = &mut page.elements[0] else { unreachable!() };
        (rect.base.x, rect.base.y, rect.base.rotation) = (100.0, 100.0, 0.0);
        (rect.width, rect.height, rect.corner_radius) = (200.0, 100.0, 0.0);
        rect.fill = fill.into();
        document
    }

    /// RGB of the pixel at the rectangle's centre, rendered at 1 px/pt.
    fn centre_pixel(fill: &str) -> [u8; 3] {
        let root = project_with_image();
        let compiled = compiled_pages(root.path(), &request(single_rect(fill)));
        let pixmap = typst_render::render(
            &compiled.pages()[0],
            &typst_render::RenderOptions { pixel_per_pt: 1.0.into(), ..Default::default() },
        );
        let pixel = pixmap.pixel(200, 150).unwrap();
        // 白底不透明，premultiplied 的值就是實際顏色
        assert_eq!(pixel.alpha(), 255);
        [pixel.red(), pixel.green(), pixel.blue()]
    }

    #[test]
    fn element_alpha_blends_with_the_page() {
        assert_eq!(centre_pixel("#ff0000"), [255, 0, 0]);
        // 50% 紅色疊在白色上 ≈ (255, 127, 127)
        let [r, g, b] = centre_pixel("#ff000080");
        assert_eq!(r, 255);
        assert!((125..=130).contains(&g) && (125..=130).contains(&b), "got {r},{g},{b}");
        assert_eq!(centre_pixel("#ff000000"), [255, 255, 255]);
    }

    #[test]
    fn pdf_carries_the_alpha() {
        let root = project_with_image();
        let opaque = render_pdf(root.path(), &request(single_rect("#ff0000")), fonts()).unwrap().bytes;
        let half = render_pdf(root.path(), &request(single_rect("#ff000080")), fonts()).unwrap().bytes;
        let has_alpha_state = |pdf: &[u8]| pdf.windows(4).any(|w| w == b"/ca ");
        assert!(!has_alpha_state(&opaque));
        assert!(has_alpha_state(&half), "PDF has no fill-opacity graphics state");
    }

    /// Writes PNG previews (2 px/pt) for visual comparison with the canvas. Renders the fixture, or
    /// an `ExportRequest` captured from the editor when `EXPORT_REQUEST_JSON` is set:
    /// `EXPORT_PREVIEW_DIR=<dir> [EXPORT_REQUEST_JSON=<file>] cargo test export_preview -- --ignored`
    #[test]
    #[ignore]
    fn export_preview() {
        let dir = std::env::var("EXPORT_PREVIEW_DIR").expect("set EXPORT_PREVIEW_DIR");
        let root = project_with_image();
        let req = match std::env::var("EXPORT_REQUEST_JSON") {
            Ok(path) => serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap(),
            Err(_) => request(fixture_document()),
        };
        let compiled = compiled_pages(root.path(), &req);
        for (index, page) in compiled.pages().iter().enumerate() {
            let pixmap =
                typst_render::render(page, &typst_render::RenderOptions { pixel_per_pt: 2.0.into(), ..Default::default() });
            pixmap.save_png(Path::new(&dir).join(format!("page-{}.png", index + 1))).unwrap();
        }
    }
}
